/**
 * Kalshi WebSocket Service
 * 
 * Real-time data streaming from Kalshi's WebSocket API.
 * Supports:
 * - Portfolio updates (positions, fills, orders)
 * - Market data (orderbook, trades, ticker)
 * - Automatic reconnection with exponential backoff
 * - RSA-PSS authentication (same as REST API)
 * 
 * Usage:
 *   const ws = new KalshiWebSocketService(config);
 *   ws.on('fill', (fill) => console.log('New fill:', fill));
 *   ws.on('portfolio:update', (pos) => console.log('Position changed:', pos));
 *   await ws.connect();
 *   ws.subscribe({ channel: 'fills' });
 *   ws.subscribe({ channel: 'portfolio' });
 */

import crypto from 'crypto';
import { wsLogger as log } from '@/lib/logger';
import {
  WebSocketConfig,
  WebSocketState,
  WebSocketStatus,
  WebSocketMessageType,
  SubscriptionChannel,
  ChannelSubscription,
  WebSocketOutgoingMessage,
  WebSocketIncomingMessage,
  WebSocketEventMap,
  WebSocketEventType,
  WebSocketEventHandler,
  FillMessage,
  OrderUpdateMessage,
  PortfolioUpdateMessage,
  BalanceUpdateMessage,
  OrderbookSnapshotMessage,
  OrderbookDeltaMessage,
  TradeMessage,
  TickerMessage,
} from '@/types/websocket';

// ============================================================================
// Constants
// ============================================================================

const WS_URLS = {
  demo: 'wss://demo-api.kalshi.co/trade-api/v2/ws',
  production: 'wss://api.elections.kalshi.com/trade-api/v2/ws',
};

const DEFAULT_CONFIG: Partial<WebSocketConfig> = {
  autoReconnect: true,
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  reconnectMultiplier: 2,
  pingIntervalMs: 30000,
  connectionTimeoutMs: 10000,
};

// ============================================================================
// Type Definitions
// ============================================================================

type EventListener<T extends WebSocketEventType> = {
  handler: WebSocketEventHandler<T>;
  once: boolean;
};

// WebSocket typing for Node.js
interface WebSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

interface WebSocketConstructor {
  new(url: string, options?: { headers?: Record<string, string> }): WebSocket;
  CONNECTING: number;
  OPEN: number;
  CLOSING: number;
  CLOSED: number;
}

// ============================================================================
// Service Implementation
// ============================================================================

export class KalshiWebSocketService {
  private config: Required<WebSocketConfig>;
  private ws: WebSocket | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectionTimer: ReturnType<typeof setTimeout> | null = null;
  private connectedAt: Date | null = null;
  private lastMessageAt: Date | null = null;
  private subscriptions: Set<string> = new Set();
  private pendingSubscriptions: ChannelSubscription[] = [];
  
  // Event listeners
  private listeners: Map<WebSocketEventType, Set<EventListener<any>>> = new Map();

  constructor(config: WebSocketConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<WebSocketConfig>;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.state === WebSocketState.CONNECTED || this.state === WebSocketState.CONNECTING) {
      log.info('Already connected or connecting');
      return;
    }

    this.state = WebSocketState.CONNECTING;
    log.info('Connecting', { environment: this.config.environment });

    try {
      await this.createConnection();
    } catch (error) {
      log.error('Connection failed', { error: String(error) });
      this.handleDisconnect('Connection failed');
      throw error;
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    log.info('Disconnecting');
    this.state = WebSocketState.CLOSING;
    this.clearTimers();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.state = WebSocketState.DISCONNECTED;
    this.subscriptions.clear();
    this.emit('disconnected', { reason: 'Client disconnect', willReconnect: false });
  }

  /**
   * Subscribe to a channel
   */
  subscribe(subscription: ChannelSubscription): void {
    const channelKey = this.getChannelKey(subscription);

    if (this.subscriptions.has(channelKey)) {
      log.debug('Already subscribed', { channel: channelKey });
      return;
    }

    if (this.state !== WebSocketState.CONNECTED) {
      // Queue for when connected
      this.pendingSubscriptions.push(subscription);
      log.debug('Queued subscription', { channel: channelKey });
      return;
    }

    this.sendMessage({
      type: WebSocketMessageType.SUBSCRIBE,
      channels: [subscription],
      id: crypto.randomUUID(),
    });
  }

  /**
   * Subscribe to multiple markets at once
   */
  subscribeMarkets(channel: SubscriptionChannel, tickers: string[]): void {
    if (this.state !== WebSocketState.CONNECTED) {
      tickers.forEach(ticker => {
        this.pendingSubscriptions.push({ channel, ticker });
      });
      return;
    }

    this.sendMessage({
      type: WebSocketMessageType.SUBSCRIBE,
      channels: [{ channel, tickers }],
      id: crypto.randomUUID(),
    });
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channel: string): void {
    if (!this.subscriptions.has(channel)) {
      return;
    }

    if (this.state === WebSocketState.CONNECTED) {
      this.sendMessage({
        type: WebSocketMessageType.UNSUBSCRIBE,
        channels: [channel],
        id: crypto.randomUUID(),
      });
    }

    this.subscriptions.delete(channel);
  }

  /**
   * Get current connection status
   */
  getStatus(): WebSocketStatus {
    return {
      state: this.state,
      connectedAt: this.connectedAt ?? undefined,
      lastMessageAt: this.lastMessageAt ?? undefined,
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions),
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED;
  }

  // ============================================================================
  // Event Emitter API
  // ============================================================================

  /**
   * Register an event listener
   */
  on<T extends WebSocketEventType>(
    event: T,
    handler: WebSocketEventHandler<T>
  ): () => void {
    return this.addListener(event, handler, false);
  }

  /**
   * Register a one-time event listener
   */
  once<T extends WebSocketEventType>(
    event: T,
    handler: WebSocketEventHandler<T>
  ): () => void {
    return this.addListener(event, handler, true);
  }

  /**
   * Remove an event listener
   */
  off<T extends WebSocketEventType>(
    event: T,
    handler: WebSocketEventHandler<T>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        if (listener.handler === handler) {
          listeners.delete(listener);
          break;
        }
      }
    }
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners(event?: WebSocketEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  private async createConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = WS_URLS[this.config.environment];
      const authHeaders = this.getAuthHeaders();

      // Dynamic import for WebSocket (works in Node.js)
      const WebSocketClass = this.getWebSocketClass();
      
      this.ws = new WebSocketClass(url, {
        headers: authHeaders,
      });

      // Connection timeout
      this.connectionTimer = setTimeout(() => {
        if (this.state === WebSocketState.CONNECTING) {
          this.ws?.close();
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeoutMs);

      this.ws.onopen = () => {
        this.clearTimer(this.connectionTimer);
        this.state = WebSocketState.CONNECTED;
        this.connectedAt = new Date();
        this.reconnectAttempts = 0;
        log.info('Connected');

        // Start ping interval
        this.startPingInterval();

        // Send pending subscriptions
        this.sendPendingSubscriptions();

        this.emit('connected', undefined);
        resolve();
      };

      this.ws.onclose = (event) => {
        log.info('Connection closed', { code: event.code, reason: event.reason });
        this.handleDisconnect(event.reason || 'Connection closed');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (event) => {
        const error = new Error(event.message || 'WebSocket error');
        log.error('WebSocket error', { error: error.message });
        this.emit('error', { error, context: 'connection' });
        
        if (this.state === WebSocketState.CONNECTING) {
          reject(error);
        }
      };
    });
  }

  private getWebSocketClass(): WebSocketConstructor {
    // Node.js 18+ has native WebSocket
    if (typeof WebSocket !== 'undefined') {
      return WebSocket as unknown as WebSocketConstructor;
    }
    
    // Fallback to ws package if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('ws') as WebSocketConstructor;
    } catch {
      throw new Error('WebSocket not available. Install "ws" package for Node.js < 18');
    }
  }

  private handleDisconnect(reason: string): void {
    this.clearTimers();
    this.ws = null;
    this.connectedAt = null;
    
    const willReconnect = this.config.autoReconnect && 
                          this.state !== WebSocketState.CLOSING;
    
    this.state = willReconnect ? WebSocketState.RECONNECTING : WebSocketState.DISCONNECTED;
    
    this.emit('disconnected', { reason, willReconnect });
    
    if (willReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(this.config.reconnectMultiplier, this.reconnectAttempts - 1),
      this.config.maxReconnectDelayMs
    );
    
    log.info('Reconnecting', { delayMs: delay, attempt: this.reconnectAttempts });
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        // Resubscribe to all channels
        this.resubscribeAll();
      } catch (error) {
        // Will be handled by handleDisconnect
        log.error('Reconnect failed', { error: String(error) });
      }
    }, delay);
  }

  private resubscribeAll(): void {
    const channels = Array.from(this.subscriptions);
    this.subscriptions.clear();
    
    for (const channelKey of channels) {
      // Parse channel key back to subscription
      const [channel, ticker] = channelKey.split(':');
      this.subscribe({
        channel: channel as SubscriptionChannel,
        ticker: ticker || undefined,
      });
    }
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private handleMessage(data: string): void {
    this.lastMessageAt = new Date();
    
    let message: WebSocketIncomingMessage;
    try {
      message = JSON.parse(data);
    } catch {
      log.error('Failed to parse message', { data: data.substring(0, 100) });
      return;
    }

    switch (message.type) {
      case WebSocketMessageType.PONG:
        // Heartbeat response, ignore
        break;
        
      case WebSocketMessageType.SUBSCRIBED:
        this.subscriptions.add((message as { channel: string }).channel);
        this.emit('subscribed', { channel: (message as { channel: string }).channel });
        break;
        
      case WebSocketMessageType.UNSUBSCRIBED:
        this.subscriptions.delete((message as { channel: string }).channel);
        this.emit('unsubscribed', { channel: (message as { channel: string }).channel });
        break;
        
      case WebSocketMessageType.ERROR:
        log.error('Server error', { message: (message as { message: string }).message });
        this.emit('error', {
          error: new Error((message as { message: string }).message),
          context: 'server',
        });
        break;
        
      // Market data
      case WebSocketMessageType.ORDERBOOK_SNAPSHOT:
        this.emit('orderbook:snapshot', message as OrderbookSnapshotMessage);
        break;
        
      case WebSocketMessageType.ORDERBOOK_DELTA:
        this.emit('orderbook:delta', message as OrderbookDeltaMessage);
        break;
        
      case WebSocketMessageType.TRADE:
        this.emit('trade', message as TradeMessage);
        break;
        
      case WebSocketMessageType.TICKER:
        this.emit('ticker', message as TickerMessage);
        break;
        
      // Portfolio data
      case WebSocketMessageType.FILL:
        this.emit('fill', message as FillMessage);
        break;
        
      case WebSocketMessageType.ORDER_UPDATE:
        this.emit('order:update', message as OrderUpdateMessage);
        break;
        
      case WebSocketMessageType.PORTFOLIO_UPDATE:
        this.emit('portfolio:update', message as PortfolioUpdateMessage);
        break;
        
      case WebSocketMessageType.BALANCE_UPDATE:
        this.emit('balance:update', message as BalanceUpdateMessage);
        break;
        
      default:
        log.debug('Unknown message type', { type: (message as { type: string }).type });
    }
  }

  private sendMessage(message: WebSocketOutgoingMessage): void {
    if (!this.ws || this.state !== WebSocketState.CONNECTED) {
      log.warn('Cannot send message: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      log.error('Failed to send message', { error: String(error) });
      this.emit('error', { error: error as Error, context: 'send' });
    }
  }

  private sendPendingSubscriptions(): void {
    const pending = [...this.pendingSubscriptions];
    this.pendingSubscriptions = [];
    
    for (const subscription of pending) {
      this.subscribe(subscription);
    }
  }

  // ============================================================================
  // Authentication
  // ============================================================================

  private getAuthHeaders(): Record<string, string> {
    const timestampMs = Date.now().toString();
    const path = '/trade-api/v2/ws';
    const signature = this.signRequest('GET', path, timestampMs);

    return {
      'KALSHI-ACCESS-KEY': this.config.apiKeyId,
      'KALSHI-ACCESS-SIGNATURE': signature,
      'KALSHI-ACCESS-TIMESTAMP': timestampMs,
    };
  }

  private signRequest(method: string, path: string, timestampMs: string): string {
    const message = `${timestampMs}${method.toUpperCase()}${path}`;
    const pemKey = this.formatPrivateKey(this.config.privateKey);

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(message);
    sign.end();

    const signature = sign.sign({
      key: pemKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });

    return signature.toString('base64');
  }

  private formatPrivateKey(key: string): string {
    if (key.includes('-----BEGIN')) {
      return key;
    }

    let cleanKey = key.replace(/^kalshi\s*key:\s*/i, '');
    cleanKey = cleanKey.replace(/\s/g, '');

    const lines: string[] = [];
    for (let i = 0; i < cleanKey.length; i += 64) {
      lines.push(cleanKey.slice(i, i + 64));
    }

    return `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----`;
  }

  // ============================================================================
  // Timers & Utilities
  // ============================================================================

  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      if (this.state === WebSocketState.CONNECTED) {
        this.sendMessage({ type: WebSocketMessageType.PING });
      }
    }, this.config.pingIntervalMs);
  }

  private clearTimers(): void {
    this.clearTimer(this.reconnectTimer);
    this.clearTimer(this.connectionTimer);
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimer(timer: ReturnType<typeof setTimeout> | null): void {
    if (timer) {
      clearTimeout(timer);
    }
  }

  private getChannelKey(subscription: ChannelSubscription): string {
    if (subscription.ticker) {
      return `${subscription.channel}:${subscription.ticker}`;
    }
    return subscription.channel;
  }

  private addListener<T extends WebSocketEventType>(
    event: T,
    handler: WebSocketEventHandler<T>,
    once: boolean
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const listener: EventListener<T> = { handler, once };
    this.listeners.get(event)!.add(listener);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  private emit<T extends WebSocketEventType>(
    event: T,
    data: WebSocketEventMap[T]
  ): void {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    for (const listener of listeners) {
      try {
        listener.handler(data);
        if (listener.once) {
          listeners.delete(listener);
        }
      } catch (error) {
        log.error('Error in event handler', { event, error: String(error) });
      }
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a KalshiWebSocketService from environment variables
 */
export function createKalshiWebSocketService(): KalshiWebSocketService {
  const apiKeyId = process.env.KALSHI_API_KEY_ID?.trim();
  const privateKey = process.env.KALSHI_API_PRIVATE_KEY?.trim();
  const envValue = (process.env.KALSHI_ENV || 'demo').trim().toLowerCase();
  const environment = (envValue === 'production' || envValue === 'demo') ? envValue : 'demo';

  if (!apiKeyId || !privateKey) {
    throw new Error('KALSHI_API_KEY_ID and KALSHI_API_PRIVATE_KEY must be set');
  }

  return new KalshiWebSocketService({
    apiKeyId,
    privateKey,
    environment: environment as 'demo' | 'production',
  });
}

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let instance: KalshiWebSocketService | null = null;

/**
 * Get or create the singleton WebSocket instance
 */
export function getKalshiWebSocket(): KalshiWebSocketService {
  if (!instance) {
    instance = createKalshiWebSocketService();
  }
  return instance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetKalshiWebSocket(): void {
  if (instance) {
    instance.disconnect();
    instance = null;
  }
}
