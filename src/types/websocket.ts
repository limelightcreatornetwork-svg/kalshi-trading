/**
 * Kalshi WebSocket Types
 * 
 * Based on Kalshi's WebSocket API for real-time data streaming.
 * Supports portfolio updates, order fills, and market data.
 */

// ============================================================================
// Connection & Authentication
// ============================================================================

export interface WebSocketConfig {
  /** API Key ID for authentication */
  apiKeyId: string;
  /** RSA Private Key (PEM or raw base64) */
  privateKey: string;
  /** Environment to connect to */
  environment: 'demo' | 'production';
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
  /** Reconnect delay multiplier for exponential backoff (default: 2) */
  reconnectMultiplier?: number;
  /** Ping interval in ms to keep connection alive (default: 30000) */
  pingIntervalMs?: number;
  /** Connection timeout in ms (default: 10000) */
  connectionTimeoutMs?: number;
}

export enum WebSocketState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSING = 'CLOSING',
}

export interface WebSocketStatus {
  state: WebSocketState;
  connectedAt?: Date;
  lastMessageAt?: Date;
  reconnectAttempts: number;
  subscriptions: string[];
}

// ============================================================================
// Message Types
// ============================================================================

export enum WebSocketMessageType {
  // Client -> Server
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  PING = 'ping',
  
  // Server -> Client
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
  PONG = 'pong',
  ERROR = 'error',
  
  // Data channels
  ORDERBOOK_SNAPSHOT = 'orderbook_snapshot',
  ORDERBOOK_DELTA = 'orderbook_delta',
  TRADE = 'trade',
  TICKER = 'ticker',
  FILL = 'fill',
  ORDER_UPDATE = 'order_update',
  PORTFOLIO_UPDATE = 'portfolio_update',
  BALANCE_UPDATE = 'balance_update',
}

export enum SubscriptionChannel {
  /** Real-time orderbook updates for a market */
  ORDERBOOK = 'orderbook',
  /** Trade/fill stream for a market */
  TRADES = 'trades',
  /** Ticker updates (best bid/ask, last price) */
  TICKER = 'ticker',
  /** User's fill updates (requires auth) */
  FILLS = 'fills',
  /** User's order updates (requires auth) */
  ORDERS = 'orders',
  /** User's portfolio/position updates (requires auth) */
  PORTFOLIO = 'portfolio',
  /** User's balance updates (requires auth) */
  BALANCE = 'balance',
}

// ============================================================================
// Client -> Server Messages
// ============================================================================

export interface SubscribeMessage {
  type: WebSocketMessageType.SUBSCRIBE;
  channels: ChannelSubscription[];
  id?: string; // Request ID for tracking
}

export interface UnsubscribeMessage {
  type: WebSocketMessageType.UNSUBSCRIBE;
  channels: string[];
  id?: string;
}

export interface ChannelSubscription {
  channel: SubscriptionChannel;
  /** Market ticker for market-specific channels */
  ticker?: string;
  /** Multiple tickers */
  tickers?: string[];
}

// ============================================================================
// Server -> Client Messages
// ============================================================================

export interface BaseWebSocketMessage {
  type: WebSocketMessageType;
  seq?: number; // Sequence number for ordering
  timestamp?: string;
}

export interface ErrorMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ERROR;
  code: string;
  message: string;
  requestId?: string;
}

export interface SubscribedMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.SUBSCRIBED;
  channel: string;
  requestId?: string;
}

// ============================================================================
// Market Data Messages
// ============================================================================

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface OrderbookSnapshotMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ORDERBOOK_SNAPSHOT;
  ticker: string;
  yesBids: OrderbookLevel[];
  yesAsks: OrderbookLevel[];
  noBids: OrderbookLevel[];
  noAsks: OrderbookLevel[];
}

export interface OrderbookDeltaMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ORDERBOOK_DELTA;
  ticker: string;
  side: 'yes' | 'no';
  bidChanges: OrderbookLevel[];
  askChanges: OrderbookLevel[];
}

export interface TradeMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.TRADE;
  ticker: string;
  tradeId: string;
  side: 'yes' | 'no';
  price: number;
  count: number;
  takerSide: 'buy' | 'sell';
  executedAt: string;
}

export interface TickerMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.TICKER;
  ticker: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  volume24h: number;
  openInterest: number;
}

// ============================================================================
// Portfolio Messages (Authenticated)
// ============================================================================

export interface FillMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.FILL;
  fillId: string;
  orderId: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  price: number;
  fee: number;
  isTaker: boolean;
  executedAt: string;
}

export interface OrderUpdateMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.ORDER_UPDATE;
  orderId: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  status: string;
  yesPrice: number;
  noPrice: number;
  initialCount: number;
  remainingCount: number;
  filledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioUpdateMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.PORTFOLIO_UPDATE;
  ticker: string;
  position: number;
  marketExposure: number;
  realizedPnl: number;
  restingOrdersCount: number;
  totalTraded: number;
  updatedAt: string;
}

export interface BalanceUpdateMessage extends BaseWebSocketMessage {
  type: WebSocketMessageType.BALANCE_UPDATE;
  balance: number;
  portfolioValue: number;
  updatedAt: string;
}

// ============================================================================
// Union Types
// ============================================================================

export type WebSocketOutgoingMessage = 
  | SubscribeMessage 
  | UnsubscribeMessage 
  | { type: WebSocketMessageType.PING };

export type WebSocketIncomingMessage =
  | ErrorMessage
  | SubscribedMessage
  | { type: WebSocketMessageType.UNSUBSCRIBED; channel: string }
  | { type: WebSocketMessageType.PONG }
  | OrderbookSnapshotMessage
  | OrderbookDeltaMessage
  | TradeMessage
  | TickerMessage
  | FillMessage
  | OrderUpdateMessage
  | PortfolioUpdateMessage
  | BalanceUpdateMessage;

// ============================================================================
// Event Types for Service Consumers
// ============================================================================

export interface WebSocketEventMap {
  // Connection events
  'connected': void;
  'disconnected': { reason: string; willReconnect: boolean };
  'reconnecting': { attempt: number; delayMs: number };
  'error': { error: Error; context?: string };
  
  // Subscription events
  'subscribed': { channel: string };
  'unsubscribed': { channel: string };
  
  // Market data events
  'orderbook:snapshot': OrderbookSnapshotMessage;
  'orderbook:delta': OrderbookDeltaMessage;
  'trade': TradeMessage;
  'ticker': TickerMessage;
  
  // Portfolio events (authenticated)
  'fill': FillMessage;
  'order:update': OrderUpdateMessage;
  'portfolio:update': PortfolioUpdateMessage;
  'balance:update': BalanceUpdateMessage;
}

export type WebSocketEventType = keyof WebSocketEventMap;
export type WebSocketEventHandler<T extends WebSocketEventType> = 
  (data: WebSocketEventMap[T]) => void;
