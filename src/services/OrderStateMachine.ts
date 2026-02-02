// Order State Machine Service
// Implements Tier 1 Feature #15: Order lifecycle state machine

import {
  Order,
  OrderStatus,
  OrderStateTransition,
  VALID_TRANSITIONS,
  isTerminalStatus,
  isValidTransition,
} from '../types/order';

export interface StateTransitionResult {
  success: boolean;
  order?: Order;
  transition?: OrderStateTransition;
  error?: string;
}

export interface OrderStateMachineEvents {
  onTransition?: (transition: OrderStateTransition, order: Order) => void;
  onTerminal?: (order: Order) => void;
  onError?: (error: Error, order: Order) => void;
}

export class OrderStateMachine {
  private events: OrderStateMachineEvents;

  constructor(events: OrderStateMachineEvents = {}) {
    this.events = events;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(fromStatus: OrderStatus, toStatus: OrderStatus): boolean {
    return isValidTransition(fromStatus, toStatus);
  }

  /**
   * Get all valid next states from current status
   */
  getValidNextStates(currentStatus: OrderStatus): OrderStatus[] {
    return VALID_TRANSITIONS[currentStatus];
  }

  /**
   * Check if an order is in a terminal state
   */
  isTerminal(status: OrderStatus): boolean {
    return isTerminalStatus(status);
  }

  /**
   * Transition an order to a new state
   * Returns the updated order and transition record
   */
  transition(
    order: Order,
    toStatus: OrderStatus,
    reason?: string,
    metadata?: Record<string, unknown>
  ): StateTransitionResult {
    const fromStatus = order.status;

    // Validate the transition
    if (!this.canTransition(fromStatus, toStatus)) {
      const error = `Invalid transition: ${fromStatus} -> ${toStatus}`;
      if (this.events.onError) {
        this.events.onError(new Error(error), order);
      }
      return {
        success: false,
        error,
      };
    }

    // Create the transition record
    const transition: OrderStateTransition = {
      id: crypto.randomUUID(),
      orderId: order.id,
      fromStatus,
      toStatus,
      reason,
      metadata,
      createdAt: new Date(),
    };

    // Update the order
    const updatedOrder: Order = {
      ...order,
      status: toStatus,
      updatedAt: new Date(),
      ...this.getTimestampUpdate(toStatus),
    };

    // Fire events
    if (this.events.onTransition) {
      this.events.onTransition(transition, updatedOrder);
    }

    if (this.isTerminal(toStatus) && this.events.onTerminal) {
      this.events.onTerminal(updatedOrder);
    }

    return {
      success: true,
      order: updatedOrder,
      transition,
    };
  }

  /**
   * Get timestamp field to update based on target status
   */
  private getTimestampUpdate(status: OrderStatus): Partial<Order> {
    const now = new Date();
    switch (status) {
      case OrderStatus.PENDING_RISK_CHECK:
        return { validatedAt: now };
      case OrderStatus.PENDING_SUBMISSION:
        return { riskCheckedAt: now };
      case OrderStatus.SUBMITTED:
        return { submittedAt: now };
      case OrderStatus.ACKNOWLEDGED:
        return { acknowledgedAt: now };
      case OrderStatus.FILLED:
        return { filledAt: now };
      case OrderStatus.CANCELLED:
        return { cancelledAt: now };
      case OrderStatus.REJECTED:
        return { rejectedAt: now };
      case OrderStatus.EXPIRED:
        return { expiredAt: now };
      case OrderStatus.FAILED:
        return { failedAt: now };
      default:
        return {};
    }
  }

  /**
   * Process a fill and update order state
   */
  processFill(
    order: Order,
    fillQty: number,
    fillPrice: number
  ): StateTransitionResult {
    // Update quantities
    const newFilledQty = order.filledQty + fillQty;
    const newRemainingQty = order.requestedQty - newFilledQty;

    // Calculate new average fill price
    const newAvgPrice =
      order.avgFillPrice !== undefined
        ? (order.avgFillPrice * order.filledQty + fillPrice * fillQty) / newFilledQty
        : fillPrice;

    // Determine new status
    const newStatus =
      newRemainingQty <= 0 ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED;

    // Create updated order with fill info
    const orderWithFill: Order = {
      ...order,
      filledQty: newFilledQty,
      remainingQty: newRemainingQty,
      avgFillPrice: newAvgPrice,
    };

    // Transition to new status
    return this.transition(orderWithFill, newStatus, 'Fill received', {
      fillQty,
      fillPrice,
      totalFilled: newFilledQty,
      remaining: newRemainingQty,
    });
  }

  /**
   * Mark order as failed with error details
   */
  markFailed(
    order: Order,
    errorCode: string,
    errorMessage: string
  ): StateTransitionResult {
    if (this.isTerminal(order.status)) {
      return {
        success: false,
        error: `Cannot fail order in terminal status: ${order.status}`,
      };
    }

    const orderWithError: Order = {
      ...order,
      errorCode,
      errorMessage,
      retryCount: order.retryCount + 1,
    };

    return this.transition(orderWithError, OrderStatus.FAILED, errorMessage, {
      errorCode,
      errorMessage,
      retryCount: orderWithError.retryCount,
    });
  }

  /**
   * Cancel an order (only valid from certain states)
   */
  cancel(order: Order, reason?: string): StateTransitionResult {
    const cancellableStates = [
      OrderStatus.ACKNOWLEDGED,
      OrderStatus.PARTIALLY_FILLED,
    ];

    if (!cancellableStates.includes(order.status)) {
      return {
        success: false,
        error: `Cannot cancel order in status: ${order.status}`,
      };
    }

    return this.transition(order, OrderStatus.CANCELLED, reason ?? 'User cancelled');
  }

  /**
   * Get the full workflow for an order (validation -> submission -> execution)
   */
  getWorkflow(): OrderStatus[] {
    return [
      OrderStatus.PENDING_VALIDATION,
      OrderStatus.PENDING_RISK_CHECK,
      OrderStatus.PENDING_SUBMISSION,
      OrderStatus.SUBMITTED,
      OrderStatus.ACKNOWLEDGED,
      OrderStatus.FILLED, // or PARTIALLY_FILLED, CANCELLED, etc.
    ];
  }

  /**
   * Calculate the progress percentage of an order through its lifecycle
   */
  getProgress(status: OrderStatus): number {
    const workflow = this.getWorkflow();
    const index = workflow.indexOf(status);
    
    if (index === -1) {
      // Terminal state that's not FILLED
      if (this.isTerminal(status)) {
        return 100;
      }
      return 0;
    }

    return Math.round((index / (workflow.length - 1)) * 100);
  }
}

// Singleton instance with default events
export const orderStateMachine = new OrderStateMachine();
