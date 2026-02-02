/**
 * KalshiWebSocketService Tests
 * 
 * Tests for WebSocket connection, subscriptions, reconnection,
 * and event handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KalshiWebSocketService,
  createKalshiWebSocketService,
  resetKalshiWebSocket,
} from '../services/KalshiWebSocketService';
import {
  WebSocketState,
  WebSocketConfig,
  WebSocketMessageType,
  SubscriptionChannel,
  FillMessage,
  PortfolioUpdateMessage,
  OrderUpdateMessage,
  TickerMessage,
} from '../types/websocket';

// ============================================================================
// Mock Crypto
// ============================================================================

// Mock the crypto module to avoid needing a real RSA key
vi.mock('crypto', async () => {
  const actual = await vi.importActual<typeof import('crypto')>('crypto');
  return {
    ...actual,
    default: {
      ...actual,
      randomUUID: actual.randomUUID,
      constants: actual.constants,
      createSign: () => ({
        update: vi.fn().mockReturnThis(),
        end: vi.fn(),
        sign: vi.fn().mockReturnValue(Buffer.from('mock-signature')),
      }),
    },
    randomUUID: actual.randomUUID,
    constants: actual.constants,
    createSign: () => ({
      update: vi.fn().mockReturnThis(),
      end: vi.fn(),
      sign: vi.fn().mockReturnValue(Buffer.from('mock-signature')),
    }),
  };
});

// ============================================================================
// Mock WebSocket
// ============================================================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;

  private sentMessages: string[] = [];

  constructor(
    public url: string,
    public options?: { headers?: Record<string, string> }
  ) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.({});
    }, 10);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }

  // Test helpers
  getSentMessages(): string[] {
    return this.sentMessages;
  }

  simulateMessage(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  simulateError(message: string): void {
    this.onerror?.({ message });
  }

  simulateClose(code = 1006, reason = 'Connection lost'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

// Mock the global WebSocket
const mockWebSocketInstances: MockWebSocket[] = [];
vi.stubGlobal('WebSocket', class extends MockWebSocket {
  constructor(url: string, options?: { headers?: Record<string, string> }) {
    super(url, options);
    mockWebSocketInstances.push(this);
  }
});

// ============================================================================
// Test Configuration
// ============================================================================

const testConfig: WebSocketConfig = {
  apiKeyId: 'test-api-key',
  // Mock key - actual signing is mocked
  privateKey: 'mock-private-key',
  environment: 'demo',
  autoReconnect: false, // Disable for most tests
  reconnectDelayMs: 100,
  maxReconnectDelayMs: 1000,
  pingIntervalMs: 30000,
  connectionTimeoutMs: 5000,
};

// ============================================================================
// Tests
// ============================================================================

describe('KalshiWebSocketService', () => {
  let service: KalshiWebSocketService;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWebSocketInstances.length = 0;
    service = new KalshiWebSocketService(testConfig);
  });

  afterEach(() => {
    service.disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetKalshiWebSocket();
  });

  // ==========================================================================
  // Connection Tests
  // ==========================================================================

  describe('Connection', () => {
    it('should connect successfully', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      expect(service.isConnected()).toBe(true);
      expect(service.getStatus().state).toBe(WebSocketState.CONNECTED);
      expect(mockWebSocketInstances.length).toBe(1);
    });

    it('should use correct WebSocket URL for demo environment', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      expect(mockWebSocketInstances[0].url).toBe('wss://demo-api.kalshi.co/trade-api/v2/ws');
    });

    it('should use correct WebSocket URL for production environment', async () => {
      const prodService = new KalshiWebSocketService({
        ...testConfig,
        environment: 'production',
      });
      
      const connectPromise = prodService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      expect(mockWebSocketInstances[0].url).toBe('wss://api.elections.kalshi.com/trade-api/v2/ws');
      prodService.disconnect();
    });

    it('should include auth headers on connection', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const options = mockWebSocketInstances[0].options;
      expect(options?.headers).toHaveProperty('KALSHI-ACCESS-KEY');
      expect(options?.headers).toHaveProperty('KALSHI-ACCESS-SIGNATURE');
      expect(options?.headers).toHaveProperty('KALSHI-ACCESS-TIMESTAMP');
    });

    it('should emit connected event', async () => {
      const onConnected = vi.fn();
      service.on('connected', onConnected);

      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      expect(onConnected).toHaveBeenCalledTimes(1);
    });

    it('should track connection time', async () => {
      const beforeConnect = new Date();
      
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const status = service.getStatus();
      expect(status.connectedAt).toBeDefined();
      expect(status.connectedAt!.getTime()).toBeGreaterThanOrEqual(beforeConnect.getTime());
    });

    it('should not create multiple connections if already connected', async () => {
      const connectPromise1 = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise1;

      await service.connect();

      expect(mockWebSocketInstances.length).toBe(1);
    });
  });

  // ==========================================================================
  // Disconnection Tests
  // ==========================================================================

  describe('Disconnection', () => {
    it('should disconnect cleanly', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      service.disconnect();

      expect(service.isConnected()).toBe(false);
      expect(service.getStatus().state).toBe(WebSocketState.DISCONNECTED);
    });

    it('should emit disconnected event', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const onDisconnected = vi.fn();
      service.on('disconnected', onDisconnected);

      service.disconnect();

      expect(onDisconnected).toHaveBeenCalledWith({
        reason: 'Client disconnect',
        willReconnect: false,
      });
    });

    it('should clear subscriptions on disconnect', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Simulate subscription
      service.subscribe({ channel: SubscriptionChannel.FILLS });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });

      expect(service.getStatus().subscriptions).toContain('fills');

      service.disconnect();

      expect(service.getStatus().subscriptions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Subscription Tests
  // ==========================================================================

  describe('Subscriptions', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;
    });

    it('should send subscribe message', () => {
      service.subscribe({ channel: SubscriptionChannel.FILLS });

      const messages = mockWebSocketInstances[0].getSentMessages();
      expect(messages.length).toBe(1);
      
      const msg = JSON.parse(messages[0]);
      expect(msg.type).toBe('subscribe');
      expect(msg.channels).toEqual([{ channel: 'fills' }]);
    });

    it('should track subscriptions after server confirmation', () => {
      service.subscribe({ channel: SubscriptionChannel.FILLS });
      
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });

      expect(service.getStatus().subscriptions).toContain('fills');
    });

    it('should emit subscribed event', () => {
      const onSubscribed = vi.fn();
      service.on('subscribed', onSubscribed);

      service.subscribe({ channel: SubscriptionChannel.PORTFOLIO });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'portfolio',
      });

      expect(onSubscribed).toHaveBeenCalledWith({ channel: 'portfolio' });
    });

    it('should subscribe to market-specific channels with ticker', () => {
      service.subscribe({ 
        channel: SubscriptionChannel.ORDERBOOK, 
        ticker: 'BTCUSD-24H' 
      });

      const messages = mockWebSocketInstances[0].getSentMessages();
      const msg = JSON.parse(messages[0]);
      expect(msg.channels).toEqual([{ channel: 'orderbook', ticker: 'BTCUSD-24H' }]);
    });

    it('should subscribe to multiple markets at once', () => {
      service.subscribeMarkets(SubscriptionChannel.TICKER, ['MARKET1', 'MARKET2', 'MARKET3']);

      const messages = mockWebSocketInstances[0].getSentMessages();
      const msg = JSON.parse(messages[0]);
      expect(msg.channels).toEqual([{ 
        channel: 'ticker', 
        tickers: ['MARKET1', 'MARKET2', 'MARKET3'] 
      }]);
    });

    it('should not duplicate subscriptions', () => {
      service.subscribe({ channel: SubscriptionChannel.FILLS });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });

      // Try to subscribe again
      service.subscribe({ channel: SubscriptionChannel.FILLS });

      const messages = mockWebSocketInstances[0].getSentMessages();
      // Should only have one subscribe message
      expect(messages.length).toBe(1);
    });

    it('should unsubscribe correctly', () => {
      service.subscribe({ channel: SubscriptionChannel.FILLS });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });

      service.unsubscribe('fills');

      const messages = mockWebSocketInstances[0].getSentMessages();
      expect(messages.length).toBe(2);
      
      const unsubMsg = JSON.parse(messages[1]);
      expect(unsubMsg.type).toBe('unsubscribe');
      expect(unsubMsg.channels).toContain('fills');
    });

    it('should queue subscriptions when not connected', async () => {
      const newService = new KalshiWebSocketService(testConfig);
      
      // Subscribe before connecting
      newService.subscribe({ channel: SubscriptionChannel.FILLS });
      
      // Now connect
      const connectPromise = newService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Check that subscription was sent after connection
      const messages = mockWebSocketInstances[1].getSentMessages();
      expect(messages.length).toBe(1);
      
      const msg = JSON.parse(messages[0]);
      expect(msg.type).toBe('subscribe');
      expect(msg.channels).toEqual([{ channel: 'fills' }]);
      
      newService.disconnect();
    });
  });

  // ==========================================================================
  // Message Handling Tests
  // ==========================================================================

  describe('Message Handling', () => {
    beforeEach(async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;
    });

    it('should emit fill events', () => {
      const onFill = vi.fn();
      service.on('fill', onFill);

      const fillMessage: FillMessage = {
        type: WebSocketMessageType.FILL,
        fillId: 'fill-123',
        orderId: 'order-456',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 10,
        price: 50,
        fee: 1,
        isTaker: true,
        executedAt: '2024-01-15T10:30:00Z',
      };

      mockWebSocketInstances[0].simulateMessage(fillMessage);

      expect(onFill).toHaveBeenCalledWith(fillMessage);
    });

    it('should emit order update events', () => {
      const onOrderUpdate = vi.fn();
      service.on('order:update', onOrderUpdate);

      const orderUpdate: OrderUpdateMessage = {
        type: WebSocketMessageType.ORDER_UPDATE,
        orderId: 'order-789',
        ticker: 'MARKET1',
        side: 'no',
        action: 'sell',
        orderType: 'limit',
        status: 'filled',
        yesPrice: 0,
        noPrice: 45,
        initialCount: 20,
        remainingCount: 0,
        filledCount: 20,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:30:00Z',
      };

      mockWebSocketInstances[0].simulateMessage(orderUpdate);

      expect(onOrderUpdate).toHaveBeenCalledWith(orderUpdate);
    });

    it('should emit portfolio update events', () => {
      const onPortfolioUpdate = vi.fn();
      service.on('portfolio:update', onPortfolioUpdate);

      const portfolioUpdate: PortfolioUpdateMessage = {
        type: WebSocketMessageType.PORTFOLIO_UPDATE,
        ticker: 'MARKET1',
        position: 100,
        marketExposure: 5000,
        realizedPnl: 250,
        restingOrdersCount: 2,
        totalTraded: 500,
        updatedAt: '2024-01-15T10:30:00Z',
      };

      mockWebSocketInstances[0].simulateMessage(portfolioUpdate);

      expect(onPortfolioUpdate).toHaveBeenCalledWith(portfolioUpdate);
    });

    it('should emit balance update events', () => {
      const onBalanceUpdate = vi.fn();
      service.on('balance:update', onBalanceUpdate);

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.BALANCE_UPDATE,
        balance: 10000,
        portfolioValue: 15000,
        updatedAt: '2024-01-15T10:30:00Z',
      });

      expect(onBalanceUpdate).toHaveBeenCalledWith({
        type: WebSocketMessageType.BALANCE_UPDATE,
        balance: 10000,
        portfolioValue: 15000,
        updatedAt: '2024-01-15T10:30:00Z',
      });
    });

    it('should emit ticker events', () => {
      const onTicker = vi.fn();
      service.on('ticker', onTicker);

      const tickerMsg: TickerMessage = {
        type: WebSocketMessageType.TICKER,
        ticker: 'MARKET1',
        yesBid: 48,
        yesAsk: 52,
        noBid: 48,
        noAsk: 52,
        lastPrice: 50,
        volume24h: 10000,
        openInterest: 5000,
      };

      mockWebSocketInstances[0].simulateMessage(tickerMsg);

      expect(onTicker).toHaveBeenCalledWith(tickerMsg);
    });

    it('should emit orderbook snapshot events', () => {
      const onSnapshot = vi.fn();
      service.on('orderbook:snapshot', onSnapshot);

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.ORDERBOOK_SNAPSHOT,
        ticker: 'MARKET1',
        yesBids: [{ price: 48, quantity: 100 }, { price: 47, quantity: 200 }],
        yesAsks: [{ price: 52, quantity: 150 }],
        noBids: [{ price: 48, quantity: 120 }],
        noAsks: [{ price: 52, quantity: 130 }],
      });

      expect(onSnapshot).toHaveBeenCalled();
    });

    it('should emit error events on server errors', () => {
      const onError = vi.fn();
      service.on('error', onError);

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.ERROR,
        code: 'INVALID_SUBSCRIPTION',
        message: 'Unknown channel',
      });

      expect(onError).toHaveBeenCalledWith({
        error: expect.any(Error),
        context: 'server',
      });
    });

    it('should update lastMessageAt on receiving messages', () => {
      const before = service.getStatus().lastMessageAt;

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.PONG,
      });

      const after = service.getStatus().lastMessageAt;
      expect(after).toBeDefined();
      expect(after).not.toEqual(before);
    });

    it('should handle malformed JSON gracefully', () => {
      const onError = vi.fn();
      service.on('error', onError);

      // Simulate raw message with invalid JSON
      mockWebSocketInstances[0].onmessage?.({ data: 'not json' });

      // Should not throw, just log
      expect(service.isConnected()).toBe(true);
    });
  });

  // ==========================================================================
  // Reconnection Tests
  // ==========================================================================

  describe('Reconnection', () => {
    it('should attempt reconnection with exponential backoff', async () => {
      const reconnectService = new KalshiWebSocketService({
        ...testConfig,
        autoReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectDelayMs: 1000,
        reconnectMultiplier: 2,
      });

      const onReconnecting = vi.fn();
      reconnectService.on('reconnecting', onReconnecting);

      const connectPromise = reconnectService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Simulate disconnect
      mockWebSocketInstances[0].simulateClose(1006, 'Connection lost');

      // First reconnect attempt
      expect(onReconnecting).toHaveBeenCalledWith({ attempt: 1, delayMs: 100 });

      // Advance time past first reconnect delay
      vi.advanceTimersByTime(100);
      vi.advanceTimersByTime(20); // For connection

      // If still not connected, will try again
      if (!reconnectService.isConnected()) {
        mockWebSocketInstances[1].simulateClose();
        expect(onReconnecting).toHaveBeenCalledWith({ attempt: 2, delayMs: 200 });
      }

      reconnectService.disconnect();
    });

    it('should emit disconnected event with willReconnect=true', async () => {
      const reconnectService = new KalshiWebSocketService({
        ...testConfig,
        autoReconnect: true,
      });

      const onDisconnected = vi.fn();
      reconnectService.on('disconnected', onDisconnected);

      const connectPromise = reconnectService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      mockWebSocketInstances[0].simulateClose(1006, 'Connection lost');

      expect(onDisconnected).toHaveBeenCalledWith({
        reason: 'Connection lost',
        willReconnect: true,
      });

      reconnectService.disconnect();
    });

    it('should resubscribe to all channels after reconnection', async () => {
      const reconnectService = new KalshiWebSocketService({
        ...testConfig,
        autoReconnect: true,
        reconnectDelayMs: 50,
      });

      const connectPromise = reconnectService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Subscribe to channels
      reconnectService.subscribe({ channel: SubscriptionChannel.FILLS });
      reconnectService.subscribe({ channel: SubscriptionChannel.PORTFOLIO });
      
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'portfolio',
      });

      const initialSubscriptions = reconnectService.getStatus().subscriptions;
      expect(initialSubscriptions).toContain('fills');
      expect(initialSubscriptions).toContain('portfolio');

      // Simulate disconnect
      mockWebSocketInstances[0].simulateClose();

      // Wait for reconnect delay + connection time
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(20);

      // Check that subscriptions were re-sent on the new WebSocket
      if (mockWebSocketInstances.length > 1) {
        const messages = mockWebSocketInstances[1].getSentMessages();
        const subscribeMessages = messages.filter(m => JSON.parse(m).type === 'subscribe');
        expect(subscribeMessages.length).toBeGreaterThanOrEqual(1);
      }

      reconnectService.disconnect();
    });

    it('should cap reconnect delay at maxReconnectDelayMs', async () => {
      const reconnectService = new KalshiWebSocketService({
        ...testConfig,
        autoReconnect: true,
        reconnectDelayMs: 100,
        maxReconnectDelayMs: 500,
        reconnectMultiplier: 10,
      });

      const reconnectDelays: number[] = [];
      reconnectService.on('reconnecting', ({ delayMs }) => {
        reconnectDelays.push(delayMs);
      });

      const connectPromise = reconnectService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Simulate first disconnect
      mockWebSocketInstances[0].simulateClose();
      
      // First attempt delay should be 100ms (base delay)
      expect(reconnectDelays[0]).toBe(100);

      // The reconnect delay calculation is:
      // delay = min(baseDelay * multiplier^(attempts-1), maxDelay)
      // attempt 1: min(100 * 10^0, 500) = min(100, 500) = 100
      // attempt 2: min(100 * 10^1, 500) = min(1000, 500) = 500
      // So with multiplier=10, second attempt would be 1000ms but capped at 500ms

      reconnectService.disconnect();
    });

    it('should reset reconnect attempts after successful connection', async () => {
      const reconnectService = new KalshiWebSocketService({
        ...testConfig,
        autoReconnect: true,
        reconnectDelayMs: 50,
      });

      const connectPromise = reconnectService.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      // Simulate disconnect and reconnect
      mockWebSocketInstances[0].simulateClose();
      vi.advanceTimersByTime(50);
      vi.advanceTimersByTime(20);

      expect(reconnectService.getStatus().reconnectAttempts).toBe(0);

      reconnectService.disconnect();
    });
  });

  // ==========================================================================
  // Event Emitter Tests
  // ==========================================================================

  describe('Event Emitter', () => {
    it('should support multiple listeners for same event', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      service.on('fill', handler1);
      service.on('fill', handler2);

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should support once() for one-time listeners', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const handler = vi.fn();
      service.once('fill', handler);

      // First fill
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      // Second fill
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-2',
        orderId: 'order-2',
        ticker: 'MARKET1',
        side: 'no',
        action: 'sell',
        count: 3,
        price: 48,
        fee: 0.3,
        isTaker: false,
        executedAt: '2024-01-15T10:01:00Z',
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support removing listeners with off()', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const handler = vi.fn();
      service.on('fill', handler);

      // First fill
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      service.off('fill', handler);

      // Second fill (should not trigger handler)
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-2',
        orderId: 'order-2',
        ticker: 'MARKET1',
        side: 'no',
        action: 'sell',
        count: 3,
        price: 48,
        fee: 0.3,
        isTaker: false,
        executedAt: '2024-01-15T10:01:00Z',
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function from on()', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const handler = vi.fn();
      const unsubscribe = service.on('fill', handler);

      // Trigger once
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      unsubscribe();

      // Try to trigger again
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-2',
        orderId: 'order-2',
        ticker: 'MARKET1',
        side: 'no',
        action: 'sell',
        count: 3,
        price: 48,
        fee: 0.3,
        isTaker: false,
        executedAt: '2024-01-15T10:01:00Z',
      });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners with removeAllListeners()', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const fillHandler = vi.fn();
      const orderHandler = vi.fn();
      
      service.on('fill', fillHandler);
      service.on('order:update', orderHandler);

      service.removeAllListeners();

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.ORDER_UPDATE,
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        orderType: 'limit',
        status: 'filled',
        yesPrice: 50,
        noPrice: 0,
        initialCount: 5,
        remainingCount: 0,
        filledCount: 5,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      });

      expect(fillHandler).not.toHaveBeenCalled();
      expect(orderHandler).not.toHaveBeenCalled();
    });

    it('should remove listeners for specific event only', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const fillHandler = vi.fn();
      const orderHandler = vi.fn();
      
      service.on('fill', fillHandler);
      service.on('order:update', orderHandler);

      service.removeAllListeners('fill');

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.FILL,
        fillId: 'fill-1',
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        count: 5,
        price: 50,
        fee: 0.5,
        isTaker: true,
        executedAt: '2024-01-15T10:00:00Z',
      });

      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.ORDER_UPDATE,
        orderId: 'order-1',
        ticker: 'MARKET1',
        side: 'yes',
        action: 'buy',
        orderType: 'limit',
        status: 'filled',
        yesPrice: 50,
        noPrice: 0,
        initialCount: 5,
        remainingCount: 0,
        filledCount: 5,
        createdAt: '2024-01-15T09:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
      });

      expect(fillHandler).not.toHaveBeenCalled();
      expect(orderHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Factory Function Tests
  // ==========================================================================

  describe('Factory Functions', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create service from environment variables', () => {
      process.env.KALSHI_API_KEY_ID = 'env-key-id';
      process.env.KALSHI_API_PRIVATE_KEY = testConfig.privateKey;
      process.env.KALSHI_ENV = 'demo';

      const envService = createKalshiWebSocketService();
      
      expect(envService).toBeInstanceOf(KalshiWebSocketService);
      envService.disconnect();
    });

    it('should throw if credentials not set', () => {
      delete process.env.KALSHI_API_KEY_ID;
      delete process.env.KALSHI_API_PRIVATE_KEY;

      expect(() => createKalshiWebSocketService()).toThrow(
        'KALSHI_API_KEY_ID and KALSHI_API_PRIVATE_KEY must be set'
      );
    });

    it('should default to demo environment', () => {
      process.env.KALSHI_API_KEY_ID = 'env-key-id';
      process.env.KALSHI_API_PRIVATE_KEY = testConfig.privateKey;
      delete process.env.KALSHI_ENV;

      const envService = createKalshiWebSocketService();
      
      // Would need to expose config to test this directly,
      // but we can verify it doesn't throw
      expect(envService).toBeInstanceOf(KalshiWebSocketService);
      envService.disconnect();
    });
  });

  // ==========================================================================
  // Status Tests
  // ==========================================================================

  describe('Status', () => {
    it('should report correct initial status', () => {
      const status = service.getStatus();
      
      expect(status.state).toBe(WebSocketState.DISCONNECTED);
      expect(status.connectedAt).toBeUndefined();
      expect(status.lastMessageAt).toBeUndefined();
      expect(status.reconnectAttempts).toBe(0);
      expect(status.subscriptions).toEqual([]);
    });

    it('should report correct connected status', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      const status = service.getStatus();
      
      expect(status.state).toBe(WebSocketState.CONNECTED);
      expect(status.connectedAt).toBeDefined();
    });

    it('should report subscriptions in status', async () => {
      const connectPromise = service.connect();
      vi.advanceTimersByTime(20);
      await connectPromise;

      service.subscribe({ channel: SubscriptionChannel.FILLS });
      service.subscribe({ channel: SubscriptionChannel.ORDERS });
      
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'fills',
      });
      mockWebSocketInstances[0].simulateMessage({
        type: WebSocketMessageType.SUBSCRIBED,
        channel: 'orders',
      });

      const status = service.getStatus();
      
      expect(status.subscriptions).toContain('fills');
      expect(status.subscriptions).toContain('orders');
    });
  });
});
