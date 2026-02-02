/**
 * Order State Machine
 * 
 * Manages order state transitions with validation and logging.
 */

import {
  OrderState,
  OrderStateType,
  VALID_TRANSITIONS,
  Order,
  OrderStateTransition,
  OMSEvent,
  OMSEventHandler,
  OMSEventType,
} from './types';

export class InvalidTransitionError extends Error {
  constructor(
    public readonly fromState: OrderStateType,
    public readonly toState: OrderStateType,
    public readonly orderId: string
  ) {
    super(
      `Invalid state transition: ${fromState} → ${toState} for order ${orderId}`
    );
    this.name = 'InvalidTransitionError';
  }
}

export class OrderStateMachine {
  private eventHandlers: Map<OMSEventType | '*', OMSEventHandler[]> = new Map();

  /**
   * Check if a state transition is valid
   */
  isValidTransition(fromState: OrderStateType, toState: OrderStateType): boolean {
    const validNextStates = VALID_TRANSITIONS[fromState];
    return validNextStates.includes(toState);
  }

  /**
   * Get all valid next states from a given state
   */
  getValidNextStates(currentState: OrderStateType): OrderStateType[] {
    return [...VALID_TRANSITIONS[currentState]];
  }

  /**
   * Check if a state is terminal (no further transitions possible)
   */
  isTerminalState(state: OrderStateType): boolean {
    return VALID_TRANSITIONS[state].length === 0;
  }

  /**
   * Check if an order can be canceled from its current state
   */
  canCancel(state: OrderStateType): boolean {
    return VALID_TRANSITIONS[state].includes(OrderState.CANCELED);
  }

  /**
   * Check if an order can be amended from its current state
   * Orders can only be amended when in ACCEPTED state
   */
  canAmend(state: OrderStateType): boolean {
    return state === OrderState.ACCEPTED;
  }

  /**
   * Create a transition record
   */
  createTransition(
    orderId: string,
    fromState: OrderStateType | null,
    toState: OrderStateType,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Omit<OrderStateTransition, 'id'> {
    // Validate transition if coming from an existing state
    if (fromState !== null && !this.isValidTransition(fromState, toState)) {
      throw new InvalidTransitionError(fromState, toState, orderId);
    }

    return {
      orderId,
      fromState,
      toState,
      reason,
      metadata,
      timestamp: new Date(),
    };
  }

  /**
   * Register an event handler
   */
  on(eventType: OMSEventType | '*', handler: OMSEventHandler): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);
  }

  /**
   * Remove an event handler
   */
  off(eventType: OMSEventType | '*', handler: OMSEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index >= 0) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all registered handlers
   */
  async emit(event: OMSEvent): Promise<void> {
    const specificHandlers = this.eventHandlers.get(event.type) || [];
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    const allHandlers = [...specificHandlers, ...wildcardHandlers];

    await Promise.all(allHandlers.map((h) => h(event)));
  }

  /**
   * Get the appropriate event type for a state transition
   */
  getEventTypeForTransition(
    fromState: OrderStateType | null,
    toState: OrderStateType
  ): OMSEventType {
    if (fromState === null) {
      return 'ORDER_CREATED';
    }

    switch (toState) {
      case OrderState.FILLED:
        return 'ORDER_FILLED';
      case OrderState.PARTIAL_FILL:
        return 'ORDER_PARTIALLY_FILLED';
      case OrderState.CANCELED:
        return 'ORDER_CANCELED';
      case OrderState.REJECTED:
        return 'ORDER_REJECTED';
      case OrderState.EXPIRED:
        return 'ORDER_EXPIRED';
      default:
        return 'ORDER_STATE_CHANGED';
    }
  }

  /**
   * Calculate remaining contracts
   */
  getRemainingContracts(order: Order): number {
    return order.contracts - order.filledContracts;
  }

  /**
   * Calculate fill percentage
   */
  getFillPercentage(order: Order): number {
    if (order.contracts === 0) return 0;
    return (order.filledContracts / order.contracts) * 100;
  }

  /**
   * Determine the appropriate state based on fill status
   */
  determineStateFromFill(order: Order, newFillContracts: number): OrderStateType {
    const totalFilled = order.filledContracts + newFillContracts;
    if (totalFilled >= order.contracts) {
      return OrderState.FILLED;
    }
    return OrderState.PARTIAL_FILL;
  }

  /**
   * Calculate new average fill price after a fill
   */
  calculateNewAvgPrice(
    currentAvgPrice: number | null | undefined,
    currentFilled: number,
    newFillPrice: number,
    newFillContracts: number
  ): number {
    const prevAvg = currentAvgPrice ?? 0;
    const totalContracts = currentFilled + newFillContracts;
    if (totalContracts === 0) return newFillPrice;

    return (
      (prevAvg * currentFilled + newFillPrice * newFillContracts) /
      totalContracts
    );
  }
}

// Export singleton instance
export const orderStateMachine = new OrderStateMachine();
