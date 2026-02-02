/**
 * OMS State Machine Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OrderStateMachine,
  InvalidTransitionError,
} from '../src/lib/oms/state-machine';
import { OrderState, OrderStateType, Order } from '../src/lib/oms/types';

describe('OrderStateMachine', () => {
  let stateMachine: OrderStateMachine;

  beforeEach(() => {
    stateMachine = new OrderStateMachine();
  });

  describe('isValidTransition', () => {
    it('should allow DRAFT → PENDING', () => {
      expect(stateMachine.isValidTransition(OrderState.DRAFT, OrderState.PENDING)).toBe(true);
    });

    it('should allow DRAFT → CANCELED', () => {
      expect(stateMachine.isValidTransition(OrderState.DRAFT, OrderState.CANCELED)).toBe(true);
    });

    it('should allow PENDING → SUBMITTED', () => {
      expect(stateMachine.isValidTransition(OrderState.PENDING, OrderState.SUBMITTED)).toBe(true);
    });

    it('should allow PENDING → REJECTED', () => {
      expect(stateMachine.isValidTransition(OrderState.PENDING, OrderState.REJECTED)).toBe(true);
    });

    it('should allow SUBMITTED → ACCEPTED', () => {
      expect(stateMachine.isValidTransition(OrderState.SUBMITTED, OrderState.ACCEPTED)).toBe(true);
    });

    it('should allow ACCEPTED → PARTIAL_FILL', () => {
      expect(stateMachine.isValidTransition(OrderState.ACCEPTED, OrderState.PARTIAL_FILL)).toBe(true);
    });

    it('should allow ACCEPTED → FILLED', () => {
      expect(stateMachine.isValidTransition(OrderState.ACCEPTED, OrderState.FILLED)).toBe(true);
    });

    it('should allow ACCEPTED → CANCELED', () => {
      expect(stateMachine.isValidTransition(OrderState.ACCEPTED, OrderState.CANCELED)).toBe(true);
    });

    it('should allow PARTIAL_FILL → FILLED', () => {
      expect(stateMachine.isValidTransition(OrderState.PARTIAL_FILL, OrderState.FILLED)).toBe(true);
    });

    it('should allow PARTIAL_FILL → PARTIAL_FILL (another fill)', () => {
      expect(stateMachine.isValidTransition(OrderState.PARTIAL_FILL, OrderState.PARTIAL_FILL)).toBe(true);
    });

    it('should NOT allow DRAFT → FILLED directly', () => {
      expect(stateMachine.isValidTransition(OrderState.DRAFT, OrderState.FILLED)).toBe(false);
    });

    it('should NOT allow FILLED → anything (terminal)', () => {
      expect(stateMachine.isValidTransition(OrderState.FILLED, OrderState.CANCELED)).toBe(false);
      expect(stateMachine.isValidTransition(OrderState.FILLED, OrderState.ACCEPTED)).toBe(false);
    });

    it('should NOT allow CANCELED → anything (terminal)', () => {
      expect(stateMachine.isValidTransition(OrderState.CANCELED, OrderState.FILLED)).toBe(false);
    });

    it('should NOT allow REJECTED → anything (terminal)', () => {
      expect(stateMachine.isValidTransition(OrderState.REJECTED, OrderState.ACCEPTED)).toBe(false);
    });
  });

  describe('isTerminalState', () => {
    it('should identify FILLED as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.FILLED)).toBe(true);
    });

    it('should identify CANCELED as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.CANCELED)).toBe(true);
    });

    it('should identify REJECTED as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.REJECTED)).toBe(true);
    });

    it('should identify EXPIRED as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.EXPIRED)).toBe(true);
    });

    it('should NOT identify DRAFT as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.DRAFT)).toBe(false);
    });

    it('should NOT identify ACCEPTED as terminal', () => {
      expect(stateMachine.isTerminalState(OrderState.ACCEPTED)).toBe(false);
    });
  });

  describe('canCancel', () => {
    it('should allow cancel from DRAFT', () => {
      expect(stateMachine.canCancel(OrderState.DRAFT)).toBe(true);
    });

    it('should allow cancel from PENDING', () => {
      expect(stateMachine.canCancel(OrderState.PENDING)).toBe(true);
    });

    it('should allow cancel from SUBMITTED', () => {
      expect(stateMachine.canCancel(OrderState.SUBMITTED)).toBe(true);
    });

    it('should allow cancel from ACCEPTED', () => {
      expect(stateMachine.canCancel(OrderState.ACCEPTED)).toBe(true);
    });

    it('should allow cancel from PARTIAL_FILL', () => {
      expect(stateMachine.canCancel(OrderState.PARTIAL_FILL)).toBe(true);
    });

    it('should NOT allow cancel from FILLED', () => {
      expect(stateMachine.canCancel(OrderState.FILLED)).toBe(false);
    });

    it('should NOT allow cancel from CANCELED', () => {
      expect(stateMachine.canCancel(OrderState.CANCELED)).toBe(false);
    });
  });

  describe('canAmend', () => {
    it('should allow amend from ACCEPTED only', () => {
      expect(stateMachine.canAmend(OrderState.ACCEPTED)).toBe(true);
    });

    it('should NOT allow amend from DRAFT', () => {
      expect(stateMachine.canAmend(OrderState.DRAFT)).toBe(false);
    });

    it('should NOT allow amend from PARTIAL_FILL', () => {
      expect(stateMachine.canAmend(OrderState.PARTIAL_FILL)).toBe(false);
    });
  });

  describe('getValidNextStates', () => {
    it('should return valid next states for DRAFT', () => {
      const nextStates = stateMachine.getValidNextStates(OrderState.DRAFT);
      expect(nextStates).toContain(OrderState.PENDING);
      expect(nextStates).toContain(OrderState.CANCELED);
      expect(nextStates).not.toContain(OrderState.FILLED);
    });

    it('should return empty array for terminal states', () => {
      expect(stateMachine.getValidNextStates(OrderState.FILLED)).toEqual([]);
      expect(stateMachine.getValidNextStates(OrderState.CANCELED)).toEqual([]);
    });
  });

  describe('createTransition', () => {
    it('should create valid transition record', () => {
      const transition = stateMachine.createTransition(
        'order-123',
        OrderState.DRAFT,
        OrderState.PENDING,
        'Order validated'
      );

      expect(transition.orderId).toBe('order-123');
      expect(transition.fromState).toBe(OrderState.DRAFT);
      expect(transition.toState).toBe(OrderState.PENDING);
      expect(transition.reason).toBe('Order validated');
      expect(transition.timestamp).toBeInstanceOf(Date);
    });

    it('should throw InvalidTransitionError for invalid transitions', () => {
      expect(() =>
        stateMachine.createTransition('order-123', OrderState.DRAFT, OrderState.FILLED)
      ).toThrow(InvalidTransitionError);
    });

    it('should allow null fromState for initial transition', () => {
      const transition = stateMachine.createTransition(
        'order-123',
        null,
        OrderState.DRAFT,
        'Order created'
      );

      expect(transition.fromState).toBeNull();
      expect(transition.toState).toBe(OrderState.DRAFT);
    });
  });

  describe('calculateNewAvgPrice', () => {
    it('should calculate correct average price for first fill', () => {
      const avgPrice = stateMachine.calculateNewAvgPrice(null, 0, 50, 10);
      expect(avgPrice).toBe(50);
    });

    it('should calculate correct weighted average for subsequent fills', () => {
      // Prev: 10 contracts @ 40 cents, New: 10 contracts @ 50 cents
      // Expected: (40*10 + 50*10) / 20 = 45
      const avgPrice = stateMachine.calculateNewAvgPrice(40, 10, 50, 10);
      expect(avgPrice).toBe(45);
    });

    it('should handle unequal fill sizes', () => {
      // Prev: 5 contracts @ 30 cents, New: 15 contracts @ 50 cents
      // Expected: (30*5 + 50*15) / 20 = (150 + 750) / 20 = 45
      const avgPrice = stateMachine.calculateNewAvgPrice(30, 5, 50, 15);
      expect(avgPrice).toBe(45);
    });
  });

  describe('determineStateFromFill', () => {
    it('should return FILLED when order completely filled', () => {
      const order: Order = {
        id: '1',
        clientOrderId: 'c1',
        marketId: 'TEST',
        action: 'buy',
        side: 'yes',
        type: 'limit',
        contracts: 100,
        filledContracts: 90,
        state: OrderState.PARTIAL_FILL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(stateMachine.determineStateFromFill(order, 10)).toBe(OrderState.FILLED);
    });

    it('should return PARTIAL_FILL when order not yet complete', () => {
      const order: Order = {
        id: '1',
        clientOrderId: 'c1',
        marketId: 'TEST',
        action: 'buy',
        side: 'yes',
        type: 'limit',
        contracts: 100,
        filledContracts: 0,
        state: OrderState.ACCEPTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(stateMachine.determineStateFromFill(order, 50)).toBe(OrderState.PARTIAL_FILL);
    });
  });

  describe('event handling', () => {
    it('should register and call event handlers', async () => {
      const handler = vi.fn();
      stateMachine.on('ORDER_CREATED', handler);

      await stateMachine.emit({
        type: 'ORDER_CREATED',
        orderId: 'order-123',
        timestamp: new Date(),
        data: { test: true },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ORDER_CREATED',
          orderId: 'order-123',
        })
      );
    });

    it('should call wildcard handlers for all events', async () => {
      const handler = vi.fn();
      stateMachine.on('*', handler);

      await stateMachine.emit({
        type: 'ORDER_FILLED',
        orderId: 'order-123',
        timestamp: new Date(),
        data: {},
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should allow removing handlers', async () => {
      const handler = vi.fn();
      stateMachine.on('ORDER_CANCELED', handler);
      stateMachine.off('ORDER_CANCELED', handler);

      await stateMachine.emit({
        type: 'ORDER_CANCELED',
        orderId: 'order-123',
        timestamp: new Date(),
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getEventTypeForTransition', () => {
    it('should return ORDER_CREATED for null → any', () => {
      expect(stateMachine.getEventTypeForTransition(null, OrderState.DRAFT)).toBe('ORDER_CREATED');
    });

    it('should return ORDER_FILLED for any → FILLED', () => {
      expect(stateMachine.getEventTypeForTransition(OrderState.ACCEPTED, OrderState.FILLED)).toBe('ORDER_FILLED');
    });

    it('should return ORDER_PARTIALLY_FILLED for any → PARTIAL_FILL', () => {
      expect(stateMachine.getEventTypeForTransition(OrderState.ACCEPTED, OrderState.PARTIAL_FILL)).toBe('ORDER_PARTIALLY_FILLED');
    });

    it('should return ORDER_CANCELED for any → CANCELED', () => {
      expect(stateMachine.getEventTypeForTransition(OrderState.ACCEPTED, OrderState.CANCELED)).toBe('ORDER_CANCELED');
    });

    it('should return ORDER_REJECTED for any → REJECTED', () => {
      expect(stateMachine.getEventTypeForTransition(OrderState.SUBMITTED, OrderState.REJECTED)).toBe('ORDER_REJECTED');
    });

    it('should return ORDER_STATE_CHANGED for other transitions', () => {
      expect(stateMachine.getEventTypeForTransition(OrderState.DRAFT, OrderState.PENDING)).toBe('ORDER_STATE_CHANGED');
    });
  });

  describe('getRemainingContracts', () => {
    it('should calculate remaining contracts correctly', () => {
      const order: Order = {
        id: '1',
        clientOrderId: 'c1',
        marketId: 'TEST',
        action: 'buy',
        side: 'yes',
        type: 'limit',
        contracts: 100,
        filledContracts: 30,
        state: OrderState.PARTIAL_FILL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(stateMachine.getRemainingContracts(order)).toBe(70);
    });
  });

  describe('getFillPercentage', () => {
    it('should calculate fill percentage correctly', () => {
      const order: Order = {
        id: '1',
        clientOrderId: 'c1',
        marketId: 'TEST',
        action: 'buy',
        side: 'yes',
        type: 'limit',
        contracts: 100,
        filledContracts: 25,
        state: OrderState.PARTIAL_FILL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(stateMachine.getFillPercentage(order)).toBe(25);
    });

    it('should return 0 for orders with 0 contracts', () => {
      const order: Order = {
        id: '1',
        clientOrderId: 'c1',
        marketId: 'TEST',
        action: 'buy',
        side: 'yes',
        type: 'limit',
        contracts: 0,
        filledContracts: 0,
        state: OrderState.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(stateMachine.getFillPercentage(order)).toBe(0);
    });
  });
});
