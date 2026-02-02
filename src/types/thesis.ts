// Thesis Types - Every trade must have a traceable thesis

export interface Thesis {
  id: string;
  marketId: string;
  marketTicker: string;
  
  // Core thesis
  hypothesis: string;        // "Why" - the trading rationale
  direction: 'yes' | 'no';   // Which side we believe
  confidence: number;        // 0-1 probability estimate
  
  // Model attribution
  modelId: string;           // Which model generated this
  modelVersion: string;      // Model version for reproducibility
  
  // Evidence & data
  evidenceLinks: string[];   // URLs to supporting evidence
  evidenceSummary?: string;  // Brief summary of evidence
  dataSnapshotId?: string;   // Link to market data snapshot
  
  // Falsification
  falsificationCriteria: string;  // When is this thesis wrong?
  invalidatedAt?: Date;           // If/when falsified
  invalidationReason?: string;    // Why it was invalidated
  
  // Pricing
  targetPrice: number;       // Fair value estimate (cents)
  edgeRequired: number;      // Minimum edge to trade (cents)
  maxPrice: number;          // Don't pay more than this
  
  // Lifecycle
  status: ThesisStatus;
  expiresAt?: Date;          // Thesis validity window
  createdAt: Date;
  updatedAt: Date;
  
  // Relations (not stored, joined)
  orders?: ThesisOrder[];
  snapshot?: DataSnapshot;
}

export enum ThesisStatus {
  ACTIVE = 'ACTIVE',           // Currently valid
  EXECUTED = 'EXECUTED',       // Trade placed
  INVALIDATED = 'INVALIDATED', // Falsification triggered
  EXPIRED = 'EXPIRED',         // Time-based expiry
  SUPERSEDED = 'SUPERSEDED',   // Replaced by new thesis
}

export interface ThesisOrder {
  id: string;
  thesisId: string;
  orderId: string;
  quantity: number;
  price: number;
  side: 'yes' | 'no';
  status: string;
  filledQty: number;
  avgFillPrice?: number;
  createdAt: Date;
}

export interface DataSnapshot {
  id: string;
  marketId: string;
  marketTicker: string;
  
  // Price data
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  
  // Orderbook (simplified - top of book)
  bidDepth: number;          // Total contracts at bid
  askDepth: number;          // Total contracts at ask
  spread: number;            // Ask - Bid
  
  // Market metadata
  volume24h: number;
  openInterest: number;
  
  // Full orderbook if available
  fullOrderbook?: {
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
  };
  
  // External data
  metadata?: Record<string, unknown>;
  
  capturedAt: Date;
}

export interface CreateThesisRequest {
  marketId: string;
  marketTicker: string;
  hypothesis: string;
  direction: 'yes' | 'no';
  confidence: number;
  modelId: string;
  modelVersion: string;
  evidenceLinks?: string[];
  evidenceSummary?: string;
  falsificationCriteria: string;
  targetPrice: number;
  edgeRequired?: number;
  maxPrice?: number;
  expiresAt?: Date;
}

export interface UpdateThesisRequest {
  confidence?: number;
  targetPrice?: number;
  maxPrice?: number;
  evidenceLinks?: string[];
  evidenceSummary?: string;
  expiresAt?: Date;
}

export interface InvalidateThesisRequest {
  thesisId: string;
  reason: string;
}

export interface ThesisEvaluation {
  thesisId: string;
  marketId: string;
  
  // Current market state
  currentPrice: number;
  
  // Thesis metrics
  thesisPrice: number;
  edge: number;                // currentPrice - thesisPrice (for direction)
  edgePercent: number;         // edge as percentage
  
  // Decision
  shouldTrade: boolean;
  reason: string;
  recommendedAction?: 'buy_yes' | 'buy_no' | 'sell_yes' | 'sell_no';
  recommendedQuantity?: number;
  recommendedPrice?: number;
}

// For tracking thesis performance over time
export interface ThesisPerformance {
  thesisId: string;
  marketId: string;
  
  // Predicted vs actual
  predictedProbability: number;
  actualOutcome?: boolean;     // true if YES won, false if NO
  brierScore?: number;         // (predicted - actual)^2
  
  // P&L
  totalContracts: number;
  avgEntryPrice: number;
  exitPrice?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  
  // Attribution
  modelId: string;
  category?: string;
  
  evaluatedAt: Date;
}
