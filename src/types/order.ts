// Order Types - Core domain types for the trading platform

export enum OrderStatus {
  // Initial states
  PENDING_VALIDATION = 'PENDING_VALIDATION',
  PENDING_RISK_CHECK = 'PENDING_RISK_CHECK',
  PENDING_SUBMISSION = 'PENDING_SUBMISSION',
  
  // Active states
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  
  // Terminal states
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
}

export enum OrderSide {
  YES = 'YES',
  NO = 'NO',
}

export enum OrderType {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum TimeInForce {
  GTC = 'GTC', // Good til cancelled
  IOC = 'IOC', // Immediate or cancel
  FOK = 'FOK', // Fill or kill
  GTD = 'GTD', // Good til date
}

export interface OrderRequest {
  idempotencyKey: string;
  marketId: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  timeInForce?: TimeInForce;
  strategyId?: string;
  signalId?: string;
}

export interface Order {
  id: string;
  idempotencyKey: string;
  externalOrderId?: string;
  marketId: string;
  side: OrderSide;
  type: OrderType;
  timeInForce: TimeInForce;
  requestedQty: number;
  filledQty: number;
  remainingQty: number;
  limitPrice?: number;
  avgFillPrice?: number;
  status: OrderStatus;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  strategyId?: string;
  signalId?: string;
  createdAt: Date;
  updatedAt: Date;
  validatedAt?: Date;
  riskCheckedAt?: Date;
  submittedAt?: Date;
  acknowledgedAt?: Date;
  filledAt?: Date;
  cancelledAt?: Date;
  rejectedAt?: Date;
  expiredAt?: Date;
  failedAt?: Date;
}

export interface OrderFill {
  id: string;
  orderId: string;
  externalId?: string;
  quantity: number;
  price: number;
  fee: number;
  filledAt: Date;
}

export interface OrderStateTransition {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// Valid state transitions
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING_VALIDATION]: [
    OrderStatus.PENDING_RISK_CHECK,
    OrderStatus.REJECTED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PENDING_RISK_CHECK]: [
    OrderStatus.PENDING_SUBMISSION,
    OrderStatus.REJECTED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PENDING_SUBMISSION]: [
    OrderStatus.SUBMITTED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.SUBMITTED]: [
    OrderStatus.ACKNOWLEDGED,
    OrderStatus.REJECTED,
    OrderStatus.FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ACKNOWLEDGED]: [
    OrderStatus.PARTIALLY_FILLED,
    OrderStatus.FILLED,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PARTIALLY_FILLED]: [
    OrderStatus.PARTIALLY_FILLED, // More fills
    OrderStatus.FILLED,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
  ],
  // Terminal states - no transitions out
  [OrderStatus.FILLED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REJECTED]: [],
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.FAILED]: [],
};

// Helper to check if a status is terminal
export function isTerminalStatus(status: OrderStatus): boolean {
  return VALID_TRANSITIONS[status].length === 0;
}

// Helper to check if transition is valid
export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
