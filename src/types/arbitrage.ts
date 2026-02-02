// Arbitrage Detection Types

export type ArbitrageType = 'SINGLE_MARKET' | 'CROSS_MARKET' | 'TEMPORAL';
export type ArbitrageStatus = 'ACTIVE' | 'EXECUTED' | 'EXPIRED' | 'MISSED';

export interface ArbitrageOpportunity {
  id: string;
  type: ArbitrageType;
  status: ArbitrageStatus;
  
  // Market info
  marketTicker: string;
  marketTitle: string;
  relatedMarketTicker?: string;
  relatedMarketTitle?: string;
  
  // Prices (in cents)
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  
  // Calculated values
  totalCost: number;      // Cost to buy YES ask + NO ask
  guaranteedPayout: number; // Always 100 cents for single market
  profitCents: number;     // Payout - Cost
  profitPercent: number;   // ROI percentage
  
  // Volume info
  maxContracts?: number;
  estimatedMaxProfit?: number;
  
  // Execution
  executedAt?: string;
  executedContracts?: number;
  actualProfit?: number;
  
  // Alert
  alertSent: boolean;
  alertSentAt?: string;
  
  // Timestamps
  detectedAt: string;
  lastSeenAt: string;
  expiredAt?: string;
}

export interface MarketWithArbitrage {
  ticker: string;
  eventTicker: string;
  title: string;
  status: string;
  
  // Prices in cents
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  
  // Arbitrage analysis
  buyBothCost: number;      // yesAsk + noAsk (cost to buy both sides)
  sellBothRevenue: number;  // yesBid + noBid (if you own both and sell)
  
  // Is there an opportunity?
  hasArbitrage: boolean;
  profitCents: number;
  profitPercent: number;
  
  volume24h: number;
  openInterest: number;
}

export interface ArbitrageScanResult {
  scanId: string;
  marketsScanned: number;
  opportunitiesFound: number;
  totalProfitPotential: number;
  scanDurationMs: number;
  
  opportunities: ArbitrageOpportunity[];
  allMarkets: MarketWithArbitrage[];
}

export interface ArbitrageExecuteRequest {
  opportunityId: string;
  contracts: number;
  maxSlippage?: number; // Max cents of slippage to accept
}

export interface ArbitrageExecuteResult {
  success: boolean;
  opportunityId: string;
  
  yesOrderId?: string;
  noOrderId?: string;
  
  yesPrice?: number;
  noPrice?: number;
  totalCost?: number;
  expectedProfit?: number;
  
  error?: string;
}
