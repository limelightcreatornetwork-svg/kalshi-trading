/**
 * Order Management System Types
 * 
 * Defines the complete type system for order lifecycle management.
 */

// =============================================================================
// ORDER STATES
// =============================================================================

export const OrderState = {
  /** Order created locally, not yet validated */
  DRAFT: 'DRAFT',
  /** Order validated, waiting to be sent to exchange */
  PENDING: 'PENDING',
  /** Order sent to Kalshi, awaiting acknowledgment */
  SUBMITTED: 'SUBMITTED',
  /** Order acknowledged by Kalshi, in the book */
  ACCEPTED: 'ACCEPTED',
  /** Order partially filled */
  PARTIAL_FILL: 'PARTIAL_FILL',
  /** Order completely filled */
  FILLED: 'FILLED',
  /** Order canceled (by user or system) */
  CANCELED: 'CANCELED',
  /** Order rejected by exchange */
  REJECTED: 'REJECTED',
  /** Order expired (time-based) */
  EXPIRED: 'EXPIRED',
} as const;

export type OrderStateType = typeof OrderState[keyof typeof OrderState];

// =============================================================================
// STATE TRANSITIONS
// =============================================================================

/**
 * Valid state transitions map
 * Key: from state, Value: array of valid to states
 */
export const VALID_TRANSITIONS: Record<OrderStateType, OrderStateType[]> = {
  [OrderState.DRAFT]: [OrderState.PENDING, OrderState.CANCELED],
  [OrderState.PENDING]: [OrderState.SUBMITTED, OrderState.CANCELED, OrderState.REJECTED],
  [OrderState.SUBMITTED]: [OrderState.ACCEPTED, OrderState.REJECTED, OrderState.CANCELED, OrderState.EXPIRED],
  [OrderState.ACCEPTED]: [OrderState.PARTIAL_FILL, OrderState.FILLED, OrderState.CANCELED, OrderState.EXPIRED],
  [OrderState.PARTIAL_FILL]: [OrderState.PARTIAL_FILL, OrderState.FILLED, OrderState.CANCELED, OrderState.EXPIRED],
  [OrderState.FILLED]: [], // Terminal state
  [OrderState.CANCELED]: [], // Terminal state
  [OrderState.REJECTED]: [], // Terminal state
  [OrderState.EXPIRED]: [], // Terminal state
};

// =============================================================================
// ORDER TYPES
// =============================================================================

export type OrderSide = 'yes' | 'no';
export type OrderAction = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

export interface OrderCreateParams {
  /** Market ticker (e.g., "FED-26MAR-T5.00") */
  marketId: string;
  /** Buy or sell */
  action: OrderAction;
  /** Yes or no side */
  side: OrderSide;
  /** Market or limit order */
  type: OrderType;
  /** Number of contracts */
  contracts: number;
  /** Limit price in cents (1-99) for limit orders */
  limitPrice?: number;
  /** Order expiration time (optional) */
  expiresAt?: Date;
  /** Client-generated order ID for idempotency */
  clientOrderId?: string;
}

export interface Order {
  /** Internal order ID (cuid) */
  id: string;
  /** Client order ID for idempotency */
  clientOrderId: string;
  /** Kalshi order ID (set after submission) */
  kalshiOrderId?: string | null;
  /** Market ticker */
  marketId: string;
  /** Buy or sell */
  action: OrderAction;
  /** Yes or no side */
  side: OrderSide;
  /** Market or limit */
  type: OrderType;
  /** Total contracts requested */
  contracts: number;
  /** Limit price in cents */
  limitPrice?: number | null;
  /** Number of contracts filled */
  filledContracts: number;
  /** Average fill price in cents */
  avgFillPrice?: number | null;
  /** Current order state */
  state: OrderStateType;
  /** Error/rejection reason */
  rejectReason?: string | null;
  /** Order expiration */
  expiresAt?: Date | null;
  /** Created timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** State transition history */
  transitions?: OrderStateTransition[];
}

export interface OrderStateTransition {
  id: string;
  orderId: string;
  fromState: OrderStateType | null;
  toState: OrderStateType;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp: Date;
}

export interface Fill {
  id: string;
  orderId: string;
  contracts: number;
  price: number;
  timestamp: Date;
  kalshiFillId?: string | null;
}

// =============================================================================
// OMS OPERATIONS
// =============================================================================

export interface OrderPlacementResult {
  success: boolean;
  order?: Order;
  error?: string;
  idempotent?: boolean; // True if order was already placed with this clientOrderId
}

export interface OrderCancelResult {
  success: boolean;
  order?: Order;
  error?: string;
}

export interface OrderAmendResult {
  success: boolean;
  originalOrder?: Order;
  newOrder?: Order;
  error?: string;
}

export interface ReconciliationResult {
  ordersChecked: number;
  driftsDetected: number;
  corrected: number;
  errors: string[];
}

// =============================================================================
// EVENTS
// =============================================================================

export type OMSEventType =
  | 'ORDER_CREATED'
  | 'ORDER_STATE_CHANGED'
  | 'ORDER_FILLED'
  | 'ORDER_PARTIALLY_FILLED'
  | 'ORDER_CANCELED'
  | 'ORDER_REJECTED'
  | 'ORDER_EXPIRED'
  | 'RECONCILIATION_DRIFT';

export interface OMSEvent {
  type: OMSEventType;
  orderId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

export type OMSEventHandler = (event: OMSEvent) => void | Promise<void>;
