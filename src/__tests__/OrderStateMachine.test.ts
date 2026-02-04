// Order State Machine Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrderStateMachine,
  OrderStateMachineEvents,
} from '../services/OrderStateMachine';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderType,
  TimeInForce,
  isTerminalStatus,
  isValidTransition,
  VALID_TRANSITIONS,
} from '../types/order';

// Helper to create a test order
function createTestOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'test-order-1',
    idempotencyKey: 'idem-key-1',
    marketId: 'market-1',
    side: OrderSide.YES,
    type: OrderType.LIMIT,
    timeInForce: TimeInForce.GTC,
    requestedQty: 100,
    filledQty: 0,
    remainingQty: 100,
    limitPrice: 0.55,
    status: OrderStatus.PENDING_VALIDATION,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Order Types', () => {
  describe('isTerminalStatus', () => {
    it('should return true for terminal states', () => {
      expect(isTerminalStatus(OrderStatus.FILLED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.CANCELLED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.REJECTED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.EXPIRED)).toBe(true);
      expect(isTerminalStatus(OrderStatus.FAILED)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalStatus(OrderStatus.PENDING_VALIDATION)).toBe(false);
      expect(isTerminalStatus(OrderStatus.PENDING_RISK_CHECK)).toBe(false);
      expect(isTerminalStatus(OrderStatus.SUBMITTED)).toBe(false);
      expect(isTerminalStatus(OrderStatus.ACKNOWLEDGED)).toBe(false);
      expect(isTerminalStatus(OrderStatus.PARTIALLY_FILLED)).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    it('should allow valid transitions', () => {
      expect(isValidTransition(OrderStatus.PENDING_VALIDATION, OrderStatus.PENDING_RISK_CHECK)).toBe(true);
      expect(isValidTransition(OrderStatus.PENDING_RISK_CHECK, OrderStatus.PENDING_SUBMISSION)).toBe(true);
      expect(isValidTransition(OrderStatus.SUBMITTED, OrderStatus.ACKNOWLEDGED)).toBe(true);
      expect(isValidTransition(OrderStatus.ACKNOWLEDGED, OrderStatus.FILLED)).toBe(true);
    });

    it('should reject invalid transitions', () => {
      expect(isValidTransition(OrderStatus.PENDING_VALIDATION, OrderStatus.FILLED)).toBe(false);
      expect(isValidTransition(OrderStatus.FILLED, OrderStatus.CANCELLED)).toBe(false);
      expect(isValidTransition(OrderStatus.CANCELLED, OrderStatus.ACKNOWLEDGED)).toBe(false);
    });

    it('should not allow transitions out of terminal states', () => {
      for (const terminalStatus of [
        OrderStatus.FILLED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
        OrderStatus.EXPIRED,
        OrderStatus.FAILED,
      ]) {
        expect(VALID_TRANSITIONS[terminalStatus].length).toBe(0);
      }
    });
  });
});

describe('OrderStateMachine', () => {
  let stateMachine: OrderStateMachine;
  let events: OrderStateMachineEvents;

  beforeEach(() => {
    events = {
      onTransition: vi.fn(),
      onTerminal: vi.fn(),
      onError: vi.fn(),
    };
    stateMachine = new OrderStateMachine(events);
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.canTransition(OrderStatus.PENDING_VALIDATION, OrderStatus.PENDING_RISK_CHECK)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(stateMachine.canTransition(OrderStatus.FILLED, OrderStatus.CANCELLED)).toBe(false);
    });
  });

  describe('getValidNextStates', () => {
    it('should return valid next states for PENDING_VALIDATION', () => {
      const nextStates = stateMachine.getValidNextStates(OrderStatus.PENDING_VALIDATION);
      expect(nextStates).toContain(OrderStatus.PENDING_RISK_CHECK);
      expect(nextStates).toContain(OrderStatus.REJECTED);
      expect(nextStates).toContain(OrderStatus.FAILED);
    });

    it('should return empty array for terminal states', () => {
      expect(stateMachine.getValidNextStates(OrderStatus.FILLED)).toEqual([]);
      expect(stateMachine.getValidNextStates(OrderStatus.CANCELLED)).toEqual([]);
    });
  });

  describe('transition', () => {
    it('should successfully transition to valid state', () => {
      const order = createTestOrder();
      const result = stateMachine.transition(order, OrderStatus.PENDING_RISK_CHECK, 'Validation passed');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.PENDING_RISK_CHECK);
      expect(result.order?.validatedAt).toBeDefined();
      expect(result.transition?.fromStatus).toBe(OrderStatus.PENDING_VALIDATION);
      expect(result.transition?.toStatus).toBe(OrderStatus.PENDING_RISK_CHECK);
      expect(result.transition?.reason).toBe('Validation passed');
    });

    it('should fail for invalid transition', () => {
      const order = createTestOrder();
      const result = stateMachine.transition(order, OrderStatus.FILLED);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('should fire onTransition event', () => {
      const order = createTestOrder();
      stateMachine.transition(order, OrderStatus.PENDING_RISK_CHECK);

      expect(events.onTransition).toHaveBeenCalled();
    });

    it('should fire onTerminal event when reaching terminal state', () => {
      const order = createTestOrder({ status: OrderStatus.ACKNOWLEDGED });
      stateMachine.transition(order, OrderStatus.FILLED);

      expect(events.onTerminal).toHaveBeenCalled();
    });

    it('should fire onError event for invalid transition', () => {
      const order = createTestOrder();
      stateMachine.transition(order, OrderStatus.FILLED);

      expect(events.onError).toHaveBeenCalled();
    });

    it('should update correct timestamp for each status', () => {
      let order = createTestOrder();
      
      // Validation -> Risk Check
      let result = stateMachine.transition(order, OrderStatus.PENDING_RISK_CHECK);
      expect(result.order?.validatedAt).toBeDefined();
      order = result.order!;

      // Risk Check -> Submission
      result = stateMachine.transition(order, OrderStatus.PENDING_SUBMISSION);
      expect(result.order?.riskCheckedAt).toBeDefined();
      order = result.order!;

      // Submission -> Submitted
      result = stateMachine.transition(order, OrderStatus.SUBMITTED);
      expect(result.order?.submittedAt).toBeDefined();
      order = result.order!;

      // Submitted -> Acknowledged
      result = stateMachine.transition(order, OrderStatus.ACKNOWLEDGED);
      expect(result.order?.acknowledgedAt).toBeDefined();
      order = result.order!;

      // Acknowledged -> Filled
      result = stateMachine.transition(order, OrderStatus.FILLED);
      expect(result.order?.filledAt).toBeDefined();
    });
  });

  describe('timestamp updates for terminal states', () => {
    it('should set rejectedAt when transitioning to REJECTED', () => {
      const order = createTestOrder({ status: OrderStatus.PENDING_VALIDATION });
      const result = stateMachine.transition(order, OrderStatus.REJECTED, 'Invalid order');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.REJECTED);
      expect(result.order?.rejectedAt).toBeDefined();
    });

    it('should set expiredAt when transitioning to EXPIRED', () => {
      const order = createTestOrder({ status: OrderStatus.ACKNOWLEDGED });
      const result = stateMachine.transition(order, OrderStatus.EXPIRED, 'Order expired');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.EXPIRED);
      expect(result.order?.expiredAt).toBeDefined();
    });

    it('should set failedAt when transitioning to FAILED', () => {
      const order = createTestOrder({ status: OrderStatus.PENDING_VALIDATION });
      const result = stateMachine.transition(order, OrderStatus.FAILED, 'System error');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.FAILED);
      expect(result.order?.failedAt).toBeDefined();
    });

    it('should set cancelledAt when transitioning to CANCELLED', () => {
      const order = createTestOrder({ status: OrderStatus.ACKNOWLEDGED });
      const result = stateMachine.transition(order, OrderStatus.CANCELLED, 'User cancelled');

      expect(result.success).toBe(true);
      expect(result.order?.cancelledAt).toBeDefined();
    });
  });

  describe('getProgress edge cases', () => {
    it('should return 100% for EXPIRED terminal state', () => {
      expect(stateMachine.getProgress(OrderStatus.EXPIRED)).toBe(100);
    });

    it('should return 100% for FAILED terminal state', () => {
      expect(stateMachine.getProgress(OrderStatus.FAILED)).toBe(100);
    });
  });

  describe('processFill', () => {
    it('should process partial fill correctly', () => {
      const order = createTestOrder({
        status: OrderStatus.ACKNOWLEDGED,
        requestedQty: 100,
        filledQty: 0,
        remainingQty: 100,
      });

      const result = stateMachine.processFill(order, 50, 0.55);

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.PARTIALLY_FILLED);
      expect(result.order?.filledQty).toBe(50);
      expect(result.order?.remainingQty).toBe(50);
      expect(result.order?.avgFillPrice).toBe(0.55);
    });

    it('should process complete fill correctly', () => {
      const order = createTestOrder({
        status: OrderStatus.ACKNOWLEDGED,
        requestedQty: 100,
        filledQty: 0,
        remainingQty: 100,
      });

      const result = stateMachine.processFill(order, 100, 0.55);

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.FILLED);
      expect(result.order?.filledQty).toBe(100);
      expect(result.order?.remainingQty).toBe(0);
    });

    it('should calculate average fill price correctly', () => {
      const order = createTestOrder({
        status: OrderStatus.PARTIALLY_FILLED,
        requestedQty: 100,
        filledQty: 50,
        remainingQty: 50,
        avgFillPrice: 0.50,
      });

      const result = stateMachine.processFill(order, 50, 0.60);

      expect(result.success).toBe(true);
      expect(result.order?.filledQty).toBe(100);
      // (0.50 * 50 + 0.60 * 50) / 100 = 0.55
      expect(result.order?.avgFillPrice).toBe(0.55);
    });

    it('should transition from PARTIALLY_FILLED to FILLED', () => {
      const order = createTestOrder({
        status: OrderStatus.PARTIALLY_FILLED,
        requestedQty: 100,
        filledQty: 50,
        remainingQty: 50,
        avgFillPrice: 0.55,
      });

      const result = stateMachine.processFill(order, 50, 0.55);

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.FILLED);
    });
  });

  describe('markFailed', () => {
    it('should mark non-terminal order as failed', () => {
      const order = createTestOrder({ status: OrderStatus.SUBMITTED });
      const result = stateMachine.markFailed(order, 'API_ERROR', 'Connection timeout');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.FAILED);
      expect(result.order?.errorCode).toBe('API_ERROR');
      expect(result.order?.errorMessage).toBe('Connection timeout');
      expect(result.order?.retryCount).toBe(1);
    });

    it('should not fail already terminal order', () => {
      const order = createTestOrder({ status: OrderStatus.FILLED });
      const result = stateMachine.markFailed(order, 'API_ERROR', 'Connection timeout');

      expect(result.success).toBe(false);
      expect(result.error).toContain('terminal status');
    });
  });

  describe('cancel', () => {
    it('should cancel ACKNOWLEDGED order', () => {
      const order = createTestOrder({ status: OrderStatus.ACKNOWLEDGED });
      const result = stateMachine.cancel(order, 'User requested');

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.CANCELLED);
    });

    it('should cancel PARTIALLY_FILLED order', () => {
      const order = createTestOrder({ status: OrderStatus.PARTIALLY_FILLED });
      const result = stateMachine.cancel(order);

      expect(result.success).toBe(true);
      expect(result.order?.status).toBe(OrderStatus.CANCELLED);
    });

    it('should not cancel PENDING_VALIDATION order', () => {
      const order = createTestOrder({ status: OrderStatus.PENDING_VALIDATION });
      const result = stateMachine.cancel(order);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });

    it('should not cancel already filled order', () => {
      const order = createTestOrder({ status: OrderStatus.FILLED });
      const result = stateMachine.cancel(order);

      expect(result.success).toBe(false);
    });
  });

  describe('getProgress', () => {
    it('should return 0% for PENDING_VALIDATION', () => {
      expect(stateMachine.getProgress(OrderStatus.PENDING_VALIDATION)).toBe(0);
    });

    it('should return 100% for FILLED', () => {
      expect(stateMachine.getProgress(OrderStatus.FILLED)).toBe(100);
    });

    it('should return 100% for other terminal states', () => {
      expect(stateMachine.getProgress(OrderStatus.CANCELLED)).toBe(100);
      expect(stateMachine.getProgress(OrderStatus.REJECTED)).toBe(100);
    });

    it('should return intermediate progress for active states', () => {
      const progress = stateMachine.getProgress(OrderStatus.SUBMITTED);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(100);
    });
  });

  describe('getWorkflow', () => {
    it('should return the happy path workflow', () => {
      const workflow = stateMachine.getWorkflow();
      expect(workflow[0]).toBe(OrderStatus.PENDING_VALIDATION);
      expect(workflow[workflow.length - 1]).toBe(OrderStatus.FILLED);
    });
  });
});
