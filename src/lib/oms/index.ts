/**
 * Order Management System (OMS)
 * 
 * A robust order lifecycle management system for the Kalshi Trading Platform.
 * 
 * Features:
 * - State machine with validated transitions
 * - Idempotent order placement
 * - Complete audit trail of state changes
 * - Fill processing with average price calculation
 * - Cancel/replace support
 * - Reconciliation with Kalshi API
 * 
 * @example
 * ```ts
 * import { oms, OrderState } from '@/lib/oms';
 * 
 * // Place an order
 * const result = await oms.placeOrder({
 *   marketId: 'FED-26MAR-T5.00',
 *   action: 'buy',
 *   side: 'yes',
 *   type: 'limit',
 *   contracts: 10,
 *   limitPrice: 35,
 *   clientOrderId: 'my-unique-id-123', // Optional: for idempotency
 * });
 * 
 * // Cancel an order
 * await oms.cancelOrder(orderId, 'User requested cancellation');
 * 
 * // Amend an order (cancel and replace)
 * await oms.amendOrder(orderId, { limitPrice: 40 });
 * 
 * // List active orders
 * const { orders } = await oms.listOrders({
 *   state: [OrderState.ACCEPTED, OrderState.PARTIAL_FILL],
 * });
 * ```
 */

export * from './types';
export * from './state-machine';
export { oms } from './oms-service';
