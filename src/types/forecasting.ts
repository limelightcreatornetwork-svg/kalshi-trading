// Forecasting Types
// For probability extraction, forecasting models, edge computation, and Kelly sizing

export interface ImpliedProbability {
  ticker: string;
  title: string;
  eventTicker: string;
  
  // Market prices (in cents, 0-100)
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  
  // Implied probabilities (0-1)
  impliedYesMid: number;       // (yesBid + yesAsk) / 2 / 100
  impliedYesBid: number;       // yesBid / 100
  impliedYesAsk: number;       // yesAsk / 100
  impliedNoMid: number;        // (noBid + noAsk) / 2 / 100
  
  // Spread info
  yesSpread: number;           // yesAsk - yesBid
  noSpread: number;            // noAsk - noBid
  spreadPercent: number;       // spread as % of mid
  
  // Liquidity
  volume24h: number;
  openInterest: number;
  
  // Metadata
  status: string;
  expirationTime: string;
  extractedAt: Date;
}

export interface ForecastModelInput {
  ticker: string;
  impliedProbability: number;  // Market's implied probability
  lastPrice: number;
  volume24h: number;
  openInterest: number;
  spread: number;
  daysToExpiration: number;
  category?: string;
}

export interface Forecast {
  id: string;
  ticker: string;
  title: string;
  eventTicker: string;
  
  // Model prediction
  modelId: string;
  modelVersion: string;
  predictedProbability: number;  // Our forecast (0-1)
  confidence: number;            // Model confidence in forecast (0-1)
  
  // Market comparison
  marketProbability: number;     // Implied from market price (0-1)
  marketPrice: number;           // Current yes ask price (cents)
  
  // Edge calculation
  edge: number;                  // predictedProbability - marketProbability
  edgeCents: number;             // edge * 100 (in price terms)
  edgePercent: number;           // edge / marketProbability * 100
  
  // Trading signal
  direction: 'yes' | 'no' | 'neutral';
  signalStrength: 'strong' | 'moderate' | 'weak' | 'none';
  
  // Kelly sizing
  kellyFraction: number;         // Optimal bet fraction (0-1)
  kellyFullBet: number;          // Full Kelly bet size in dollars
  kellyHalfBet: number;          // Half Kelly (more conservative)
  kellyQuarterBet: number;       // Quarter Kelly (very conservative)
  
  // Risk metrics
  expectedValue: number;         // Expected profit per dollar bet
  maxLoss: number;               // Maximum loss per contract
  probabilityOfProfit: number;   // Probability of winning
  
  // Metadata
  createdAt: Date;
  expirationTime: string;
  daysToExpiration: number;
}

export interface EdgeOpportunity {
  forecast: Forecast;
  recommendedBet: 'full_kelly' | 'half_kelly' | 'quarter_kelly' | 'no_bet';
  recommendedContracts: number;
  maxContracts: number;  // Based on position limits
  expectedProfit: number;
  riskRewardRatio: number;
  reason: string;
}

export interface KellyResult {
  fraction: number;           // Optimal fraction of bankroll (0-1)
  fullKellyBet: number;       // Full Kelly bet in dollars
  halfKellyBet: number;       // Half Kelly (more conservative)
  quarterKellyBet: number;    // Quarter Kelly (very conservative)
  expectedEdge: number;       // Expected edge per bet
  expectedGrowth: number;     // Expected log growth rate
  maxDrawdownRisk: number;    // Approximate max drawdown probability
}

export interface ForecastingConfig {
  // Model parameters
  modelId: string;
  modelVersion: string;
  
  // Edge thresholds
  minEdgeToTrade: number;       // Minimum edge to consider trading (e.g., 0.02 = 2%)
  minConfidence: number;        // Minimum model confidence (0-1)
  
  // Kelly parameters
  bankroll: number;             // Total available capital
  maxKellyFraction: number;     // Cap Kelly at this fraction (e.g., 0.25 = quarter Kelly)
  maxPositionPercent: number;   // Max % of bankroll per position
  
  // Filters
  minVolume24h: number;         // Minimum 24h volume
  minOpenInterest: number;      // Minimum open interest
  maxSpreadPercent: number;     // Maximum spread as % of mid
  minDaysToExpiration: number;  // Don't trade markets expiring too soon
}

export interface ForecastingSummary {
  totalMarkets: number;
  marketsWithEdge: number;
  avgEdge: number;
  maxEdge: number;
  totalExpectedValue: number;
  recommendedBets: EdgeOpportunity[];
  modelCalibration: {
    modelId: string;
    brierScore?: number;
    accuracy?: number;
    totalPredictions: number;
  };
  generatedAt: Date;
}

// Forecast model types
export type ForecastModelType = 
  | 'baseline'           // Simple model based on market prices
  | 'mean_reversion'     // Assumes prices revert to historical mean
  | 'momentum'           // Follows recent price trends
  | 'volume_weighted'    // Weighs by trading volume
  | 'ensemble';          // Combines multiple models

export interface ForecastModel {
  id: string;
  type: ForecastModelType;
  version: string;
  description: string;
  
  // Generate a probability forecast
  predict(input: ForecastModelInput): Promise<{
    probability: number;
    confidence: number;
    reasoning?: string;
  }>;
}
