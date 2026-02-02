/**
 * Order Management Service
 * 
 * Core OMS implementation handling order lifecycle, persistence,
 * and integration with Kalshi API.
 */

import { kalshiClient } from '../kalshi';
import { orderStateMachine, InvalidTransitionError } from './state-machine';
import {
  Order,
  OrderState,
  OrderStateType,
  OrderCreateParams,
  OrderPlacementResult,
  OrderCancelResult,
  OrderAmendResult,
  ReconciliationResult,
  Fill,
} from './types';

// Lazy-initialize Prisma client only when DATABASE_URL is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;

function getPrisma() {
  if (!prisma) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for OMS operations');
    }
    // Dynamic import to avoid build-time initialization
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Generate a unique client order ID
 */
function generateClientOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `oms_${timestamp}_${random}`;
}

export class OrderManagementService {
  /**
   * Create a new order (DRAFT state)
   * Supports idempotent placement via clientOrderId
   */
  async createOrder(params: OrderCreateParams): Promise<OrderPlacementResult> {
    const clientOrderId = params.clientOrderId || generateClientOrderId();

    // Check for existing order with same clientOrderId (idempotency)
    const existing = await getPrisma().omsOrder.findUnique({
      where: { clientOrderId },
      include: { transitions: true, fills: true },
    });

    if (existing) {
      return {
        success: true,
        order: this.mapPrismaOrder(existing),
        idempotent: true,
      };
    }

    // Validate limit price for limit orders
    if (params.type === 'limit' && !params.limitPrice) {
      return {
        success: false,
        error: 'Limit orders require a limitPrice',
      };
    }

    // Validate price range (Kalshi uses cents 1-99)
    if (params.limitPrice && (params.limitPrice < 1 || params.limitPrice > 99)) {
      return {
        success: false,
        error: 'Limit price must be between 1 and 99 cents',
      };
    }

    try {
      // Create order in DRAFT state with initial transition
      const order = await getPrisma().omsOrder.create({
        data: {
          clientOrderId,
          marketId: params.marketId,
          action: params.action,
          side: params.side,
          type: params.type,
          contracts: params.contracts,
          limitPrice: params.limitPrice,
          state: OrderState.DRAFT,
          expiresAt: params.expiresAt,
          transitions: {
            create: {
              fromState: null,
              toState: OrderState.DRAFT,
              reason: 'Order created',
            },
          },
        },
        include: { transitions: true, fills: true },
      });

      await orderStateMachine.emit({
        type: 'ORDER_CREATED',
        orderId: order.id,
        timestamp: new Date(),
        data: { clientOrderId, params },
      });

      return {
        success: true,
        order: this.mapPrismaOrder(order),
      };
    } catch (error) {
      console.error('Failed to create order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create order',
      };
    }
  }

  /**
   * Submit an order to Kalshi
   * Transitions: DRAFT → PENDING → SUBMITTED → ACCEPTED
   */
  async submitOrder(orderId: string): Promise<OrderPlacementResult> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
      include: { transitions: true, fills: true },
    });

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Validate state
    if (order.state !== OrderState.DRAFT) {
      return {
        success: false,
        error: `Cannot submit order in ${order.state} state`,
      };
    }

    try {
      // Transition to PENDING
      await this.transitionState(orderId, OrderState.PENDING, 'Preparing to submit');

      // Transition to SUBMITTED
      await this.transitionState(orderId, OrderState.SUBMITTED, 'Sending to Kalshi');

      // Submit to Kalshi
      const result = await kalshiClient.createOrder({
        ticker: order.marketId,
        action: order.action as 'buy' | 'sell',
        side: order.side as 'yes' | 'no',
        type: order.type as 'market' | 'limit',
        count: order.contracts,
        limit_price: order.limitPrice ?? undefined,
      });

      if (!result.success || !result.order) {
        // Transition to REJECTED
        await this.transitionState(
          orderId,
          OrderState.REJECTED,
          result.error || 'Kalshi rejected the order',
          { kalshiError: result.error }
        );

        const rejectedOrder = await getPrisma().omsOrder.findUnique({
          where: { id: orderId },
          include: { transitions: true, fills: true },
        });

        return {
          success: false,
          order: rejectedOrder ? this.mapPrismaOrder(rejectedOrder) : undefined,
          error: result.error,
        };
      }

      // Update with Kalshi order ID and transition to ACCEPTED
      const updatedOrder = await getPrisma().omsOrder.update({
        where: { id: orderId },
        data: { kalshiOrderId: result.order.order_id },
        include: { transitions: true, fills: true },
      });

      await this.transitionState(
        orderId,
        OrderState.ACCEPTED,
        'Order accepted by Kalshi',
        { kalshiOrderId: result.order.order_id, mock: result.mock }
      );

      const finalOrder = await getPrisma().omsOrder.findUnique({
        where: { id: orderId },
        include: { transitions: true, fills: true },
      });

      return {
        success: true,
        order: finalOrder ? this.mapPrismaOrder(finalOrder) : this.mapPrismaOrder(updatedOrder),
      };
    } catch (error) {
      console.error('Failed to submit order:', error);

      // Attempt to mark as rejected
      try {
        await this.transitionState(
          orderId,
          OrderState.REJECTED,
          error instanceof Error ? error.message : 'Submission failed'
        );
      } catch {
        // Ignore transition errors during error handling
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit order',
      };
    }
  }

  /**
   * Create and immediately submit an order
   */
  async placeOrder(params: OrderCreateParams): Promise<OrderPlacementResult> {
    const createResult = await this.createOrder(params);
    if (!createResult.success || !createResult.order) {
      return createResult;
    }

    // If idempotent (order already existed), return as-is
    if (createResult.idempotent) {
      return createResult;
    }

    return this.submitOrder(createResult.order.id);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, reason?: string): Promise<OrderCancelResult> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
      include: { transitions: true, fills: true },
    });

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Check if cancellation is valid
    if (!orderStateMachine.canCancel(order.state as OrderStateType)) {
      return {
        success: false,
        error: `Cannot cancel order in ${order.state} state`,
      };
    }

    try {
      // If order was submitted to Kalshi, cancel there first
      if (order.kalshiOrderId) {
        const result = await kalshiClient.cancelOrder(order.kalshiOrderId);
        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Failed to cancel on Kalshi',
          };
        }
      }

      // Transition to CANCELED
      await this.transitionState(
        orderId,
        OrderState.CANCELED,
        reason || 'Order canceled by user'
      );

      const canceledOrder = await getPrisma().omsOrder.findUnique({
        where: { id: orderId },
        include: { transitions: true, fills: true },
      });

      return {
        success: true,
        order: canceledOrder ? this.mapPrismaOrder(canceledOrder) : undefined,
      };
    } catch (error) {
      console.error('Failed to cancel order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel order',
      };
    }
  }

  /**
   * Amend an order (cancel and replace)
   */
  async amendOrder(
    orderId: string,
    newParams: Partial<Pick<OrderCreateParams, 'contracts' | 'limitPrice'>>
  ): Promise<OrderAmendResult> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
      include: { transitions: true, fills: true },
    });

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Check if amendment is valid
    if (!orderStateMachine.canAmend(order.state as OrderStateType)) {
      return {
        success: false,
        error: `Cannot amend order in ${order.state} state`,
      };
    }

    try {
      // Cancel the original order
      const cancelResult = await this.cancelOrder(orderId, 'Amended - replaced with new order');
      if (!cancelResult.success) {
        return {
          success: false,
          error: `Failed to cancel original order: ${cancelResult.error}`,
        };
      }

      // Create new order with amended parameters
      const newOrderParams: OrderCreateParams = {
        marketId: order.marketId,
        action: order.action as 'buy' | 'sell',
        side: order.side as 'yes' | 'no',
        type: order.type as 'market' | 'limit',
        contracts: newParams.contracts ?? order.contracts,
        limitPrice: newParams.limitPrice ?? order.limitPrice ?? undefined,
        expiresAt: order.expiresAt ?? undefined,
        // Generate new clientOrderId for amended order
      };

      const newOrderResult = await this.placeOrder(newOrderParams);

      return {
        success: newOrderResult.success,
        originalOrder: cancelResult.order,
        newOrder: newOrderResult.order,
        error: newOrderResult.error,
      };
    } catch (error) {
      console.error('Failed to amend order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to amend order',
      };
    }
  }

  /**
   * Process a fill for an order
   */
  async processFill(
    orderId: string,
    fillContracts: number,
    fillPrice: number,
    kalshiFillId?: string
  ): Promise<Order | null> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
      include: { transitions: true, fills: true },
    });

    if (!order) {
      console.error(`Order not found for fill: ${orderId}`);
      return null;
    }

    // Calculate new state and average price
    const newState = orderStateMachine.determineStateFromFill(
      this.mapPrismaOrder(order),
      fillContracts
    );
    const newAvgPrice = orderStateMachine.calculateNewAvgPrice(
      order.avgFillPrice,
      order.filledContracts,
      fillPrice,
      fillContracts
    );

    try {
      // Record the fill and update order
      const updatedOrder = await getPrisma().omsOrder.update({
        where: { id: orderId },
        data: {
          filledContracts: order.filledContracts + fillContracts,
          avgFillPrice: newAvgPrice,
          fills: {
            create: {
              contracts: fillContracts,
              price: fillPrice,
              kalshiFillId,
            },
          },
        },
        include: { transitions: true, fills: true },
      });

      // Transition state if changed
      if (newState !== order.state) {
        await this.transitionState(
          orderId,
          newState,
          newState === OrderState.FILLED ? 'Order fully filled' : 'Order partially filled',
          { fillContracts, fillPrice, totalFilled: updatedOrder.filledContracts }
        );
      }

      const finalOrder = await getPrisma().omsOrder.findUnique({
        where: { id: orderId },
        include: { transitions: true, fills: true },
      });

      // Emit fill event
      await orderStateMachine.emit({
        type: newState === OrderState.FILLED ? 'ORDER_FILLED' : 'ORDER_PARTIALLY_FILLED',
        orderId,
        timestamp: new Date(),
        data: {
          fillContracts,
          fillPrice,
          totalFilled: updatedOrder.filledContracts,
          avgPrice: newAvgPrice,
        },
      });

      return finalOrder ? this.mapPrismaOrder(finalOrder) : null;
    } catch (error) {
      console.error('Failed to process fill:', error);
      return null;
    }
  }

  /**
   * Reconcile local orders with Kalshi
   */
  async reconcile(): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      ordersChecked: 0,
      driftsDetected: 0,
      corrected: 0,
      errors: [],
    };

    try {
      // Get all non-terminal orders
      const activeOrders = await getPrisma().omsOrder.findMany({
        where: {
          state: {
            in: [
              OrderState.SUBMITTED,
              OrderState.ACCEPTED,
              OrderState.PARTIAL_FILL,
            ],
          },
          kalshiOrderId: { not: null },
        },
        include: { transitions: true, fills: true },
      });

      result.ordersChecked = activeOrders.length;

      // For each order, check status with Kalshi
      for (const order of activeOrders) {
        try {
          // In production, you would fetch order status from Kalshi
          // const kalshiOrder = await kalshiClient.getOrder(order.kalshiOrderId);
          // For now, we'll simulate reconciliation logging

          console.log(`Reconciling order ${order.id} (Kalshi: ${order.kalshiOrderId})`);
          
          // If there's a drift, emit event and correct
          // This is a placeholder for actual Kalshi status checking
        } catch (error) {
          const msg = `Failed to reconcile order ${order.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(msg);
        }
      }

      return result;
    } catch (error) {
      console.error('Reconciliation failed:', error);
      result.errors.push(error instanceof Error ? error.message : 'Reconciliation failed');
      return result;
    }
  }

  /**
   * Get an order by ID
   */
  async getOrder(orderId: string): Promise<Order | null> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
      include: { transitions: true, fills: true },
    });

    return order ? this.mapPrismaOrder(order) : null;
  }

  /**
   * Get an order by client order ID
   */
  async getOrderByClientId(clientOrderId: string): Promise<Order | null> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { clientOrderId },
      include: { transitions: true, fills: true },
    });

    return order ? this.mapPrismaOrder(order) : null;
  }

  /**
   * List orders with optional filters
   */
  async listOrders(params?: {
    state?: OrderStateType | OrderStateType[];
    marketId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: Order[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (params?.state) {
      where.state = Array.isArray(params.state)
        ? { in: params.state }
        : params.state;
    }

    if (params?.marketId) {
      where.marketId = params.marketId;
    }

    const [orders, total] = await Promise.all([
      prisma.omsOrder.findMany({
        where,
        include: { transitions: true, fills: true },
        orderBy: { createdAt: 'desc' },
        take: params?.limit ?? 50,
        skip: params?.offset ?? 0,
      }),
      prisma.omsOrder.count({ where }),
    ]);

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: orders.map((o: any) => this.mapPrismaOrder(o)),
      total,
    };
  }

  /**
   * Get fills for an order
   */
  async getOrderFills(orderId: string): Promise<Fill[]> {
    const fills = await getPrisma().omsFill.findMany({
      where: { orderId },
      orderBy: { timestamp: 'asc' },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return fills.map((f: any) => ({
      id: f.id,
      orderId: f.orderId,
      contracts: f.contracts,
      price: f.price,
      timestamp: f.timestamp,
      kalshiFillId: f.kalshiFillId,
    }));
  }

  /**
   * Transition order state with validation and logging
   */
  private async transitionState(
    orderId: string,
    newState: OrderStateType,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const order = await getPrisma().omsOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const currentState = order.state as OrderStateType;

    // Validate transition
    if (!orderStateMachine.isValidTransition(currentState, newState)) {
      throw new InvalidTransitionError(currentState, newState, orderId);
    }

    // Update order state and create transition record
    await getPrisma().$transaction([
      prisma.omsOrder.update({
        where: { id: orderId },
        data: {
          state: newState,
          rejectReason: newState === OrderState.REJECTED ? reason : undefined,
        },
      }),
      prisma.omsStateTransition.create({
        data: {
          orderId,
          fromState: currentState,
          toState: newState,
          reason,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
        },
      }),
    ]);

    // Emit state change event
    const eventType = orderStateMachine.getEventTypeForTransition(currentState, newState);
    await orderStateMachine.emit({
      type: eventType,
      orderId,
      timestamp: new Date(),
      data: { fromState: currentState, toState: newState, reason, metadata },
    });
  }

  /**
   * Map Prisma order to OMS Order type
   */
  private mapPrismaOrder(prismaOrder: {
    id: string;
    clientOrderId: string;
    kalshiOrderId: string | null;
    marketId: string;
    action: string;
    side: string;
    type: string;
    contracts: number;
    limitPrice: number | null;
    filledContracts: number;
    avgFillPrice: number | null;
    state: string;
    rejectReason: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    transitions?: Array<{
      id: string;
      orderId: string;
      fromState: string | null;
      toState: string;
      reason: string | null;
      metadata: unknown;
      timestamp: Date;
    }>;
    fills?: Array<{
      id: string;
      orderId: string;
      contracts: number;
      price: number;
      timestamp: Date;
      kalshiFillId: string | null;
    }>;
  }): Order {
    return {
      id: prismaOrder.id,
      clientOrderId: prismaOrder.clientOrderId,
      kalshiOrderId: prismaOrder.kalshiOrderId,
      marketId: prismaOrder.marketId,
      action: prismaOrder.action as 'buy' | 'sell',
      side: prismaOrder.side as 'yes' | 'no',
      type: prismaOrder.type as 'market' | 'limit',
      contracts: prismaOrder.contracts,
      limitPrice: prismaOrder.limitPrice,
      filledContracts: prismaOrder.filledContracts,
      avgFillPrice: prismaOrder.avgFillPrice,
      state: prismaOrder.state as OrderStateType,
      rejectReason: prismaOrder.rejectReason,
      expiresAt: prismaOrder.expiresAt,
      createdAt: prismaOrder.createdAt,
      updatedAt: prismaOrder.updatedAt,
      transitions: prismaOrder.transitions?.map((t) => ({
        id: t.id,
        orderId: t.orderId,
        fromState: t.fromState as OrderStateType | null,
        toState: t.toState as OrderStateType,
        reason: t.reason,
        metadata: t.metadata as Record<string, unknown> | null,
        timestamp: t.timestamp,
      })),
    };
  }
}

// Export singleton instance
export const oms = new OrderManagementService();
