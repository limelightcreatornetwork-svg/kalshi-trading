/**
 * Arbitrage Detection Library
 * 
 * Detects mispricing opportunities in Kalshi prediction markets.
 * 
 * Types of arbitrage:
 * 1. Single Market Mispricing: YES + NO prices should = $1.00
 * 2. Cross-Market Arbitrage: Related markets that should sum to 100%
 */

import { KalshiMarket } from './kalshi';

export interface ArbitrageOpportunity {
  id: string;
  type: 'single_market' | 'cross_market';
  markets: KalshiMarket[];
  spread: number; // cents
  profitPotential: number; // cents per contract
  direction: 'buy_both' | 'sell_both' | 'complex';
  confidence: 'high' | 'medium' | 'low';
  description: string;
  executionSteps: ExecutionStep[];
  detectedAt: string;
  expiresAt?: string;
}

export interface ExecutionStep {
  order: number;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  ticker: string;
  price: number; // cents
  description: string;
}

export interface ArbitrageScanResult {
  opportunities: ArbitrageOpportunity[];
  marketsScanned: number;
  scanDuration: number;
  timestamp: string;
}

/**
 * Detect single market mispricing opportunities
 * 
 * In a perfect market: YES_ask + NO_ask = 100 cents ($1.00)
 * If YES_ask + NO_ask < 100: Buy both YES and NO for guaranteed profit
 * If YES_bid + NO_bid > 100: Sell both for guaranteed profit (if allowed)
 */
export function detectSingleMarketArbitrage(markets: KalshiMarket[]): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  for (const market of markets) {
    if (market.status !== 'active') continue;
    
    // Check if we can buy both YES and NO for less than $1.00
    const buyBothCost = market.yes_ask + market.no_ask;
    const sellBothValue = market.yes_bid + market.no_bid;
    
    // Opportunity: Buy both sides for less than $1.00
    if (buyBothCost < 100) {
      const profit = 100 - buyBothCost;
      const spread = profit;
      
      // Only flag if deviation > 1 cent (to avoid noise)
      if (profit > 1) {
        opportunities.push({
          id: `single_buy_${market.ticker}_${Date.now()}`,
          type: 'single_market',
          markets: [market],
          spread,
          profitPotential: profit,
          direction: 'buy_both',
          confidence: profit >= 5 ? 'high' : profit >= 2 ? 'medium' : 'low',
          description: `Buy YES@${market.yes_ask}¢ + NO@${market.no_ask}¢ = ${buyBothCost}¢ (guaranteed ${profit}¢ profit)`,
          executionSteps: [
            {
              order: 1,
              action: 'buy',
              side: 'yes',
              ticker: market.ticker,
              price: market.yes_ask,
              description: `Buy YES at ${market.yes_ask}¢`,
            },
            {
              order: 2,
              action: 'buy',
              side: 'no',
              ticker: market.ticker,
              price: market.no_ask,
              description: `Buy NO at ${market.no_ask}¢`,
            },
          ],
          detectedAt: new Date().toISOString(),
          expiresAt: market.expiration_time,
        });
      }
    }
    
    // Opportunity: Sell both sides for more than $1.00 (if you hold positions)
    if (sellBothValue > 100) {
      const profit = sellBothValue - 100;
      
      if (profit > 1) {
        opportunities.push({
          id: `single_sell_${market.ticker}_${Date.now()}`,
          type: 'single_market',
          markets: [market],
          spread: profit,
          profitPotential: profit,
          direction: 'sell_both',
          confidence: profit >= 5 ? 'high' : profit >= 2 ? 'medium' : 'low',
          description: `Sell YES@${market.yes_bid}¢ + NO@${market.no_bid}¢ = ${sellBothValue}¢ (${profit}¢ over parity)`,
          executionSteps: [
            {
              order: 1,
              action: 'sell',
              side: 'yes',
              ticker: market.ticker,
              price: market.yes_bid,
              description: `Sell YES at ${market.yes_bid}¢`,
            },
            {
              order: 2,
              action: 'sell',
              side: 'no',
              ticker: market.ticker,
              price: market.no_bid,
              description: `Sell NO at ${market.no_bid}¢`,
            },
          ],
          detectedAt: new Date().toISOString(),
          expiresAt: market.expiration_time,
        });
      }
    }
  }
  
  return opportunities;
}

/**
 * Detect cross-market arbitrage opportunities
 * 
 * For mutually exclusive events within the same series,
 * the sum of all YES prices should equal 100%
 */
export function detectCrossMarketArbitrage(markets: KalshiMarket[]): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  // Group markets by event_ticker
  const eventGroups = new Map<string, KalshiMarket[]>();
  for (const market of markets) {
    if (market.status !== 'active') continue;
    
    const existing = eventGroups.get(market.event_ticker) || [];
    existing.push(market);
    eventGroups.set(market.event_ticker, existing);
  }
  
  // Check each event group
  for (const [eventTicker, eventMarkets] of eventGroups) {
    if (eventMarkets.length < 2) continue;
    
    // Sort by ticker for consistency
    eventMarkets.sort((a, b) => a.ticker.localeCompare(b.ticker));
    
    // Calculate sum of YES asks (cost to buy all YES outcomes)
    const sumYesAsks = eventMarkets.reduce((sum, m) => sum + m.yes_ask, 0);
    
    // In mutually exclusive events, exactly one outcome wins
    // If sum of YES asks < 100, buying all YES guarantees profit
    if (sumYesAsks < 100 && eventMarkets.length >= 2) {
      const profit = 100 - sumYesAsks;
      
      if (profit > 1) {
        opportunities.push({
          id: `cross_${eventTicker}_${Date.now()}`,
          type: 'cross_market',
          markets: eventMarkets,
          spread: profit,
          profitPotential: profit,
          direction: 'complex',
          confidence: profit >= 10 ? 'high' : profit >= 5 ? 'medium' : 'low',
          description: `Event ${eventTicker}: Buy all ${eventMarkets.length} YES outcomes for ${sumYesAsks}¢ (one must win = 100¢, profit ${profit}¢)`,
          executionSteps: eventMarkets.map((m, i) => ({
            order: i + 1,
            action: 'buy' as const,
            side: 'yes' as const,
            ticker: m.ticker,
            price: m.yes_ask,
            description: `Buy YES "${m.title}" at ${m.yes_ask}¢`,
          })),
          detectedAt: new Date().toISOString(),
        });
      }
    }
    
    // If sum of YES bids > 100, selling all YES (if held) guarantees profit
    const sumYesBids = eventMarkets.reduce((sum, m) => sum + m.yes_bid, 0);
    if (sumYesBids > 100 && eventMarkets.length >= 2) {
      const profit = sumYesBids - 100;
      
      if (profit > 1) {
        opportunities.push({
          id: `cross_sell_${eventTicker}_${Date.now()}`,
          type: 'cross_market',
          markets: eventMarkets,
          spread: profit,
          profitPotential: profit,
          direction: 'complex',
          confidence: profit >= 10 ? 'high' : profit >= 5 ? 'medium' : 'low',
          description: `Event ${eventTicker}: Sell all ${eventMarkets.length} YES positions for ${sumYesBids}¢ (pay out 100¢, profit ${profit}¢)`,
          executionSteps: eventMarkets.map((m, i) => ({
            order: i + 1,
            action: 'sell' as const,
            side: 'yes' as const,
            ticker: m.ticker,
            price: m.yes_bid,
            description: `Sell YES "${m.title}" at ${m.yes_bid}¢`,
          })),
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }
  
  return opportunities;
}

/**
 * Run full arbitrage scan
 */
export function scanForArbitrage(markets: KalshiMarket[]): ArbitrageScanResult {
  const startTime = Date.now();
  
  const singleMarket = detectSingleMarketArbitrage(markets);
  const crossMarket = detectCrossMarketArbitrage(markets);
  
  const allOpportunities = [...singleMarket, ...crossMarket]
    .sort((a, b) => b.profitPotential - a.profitPotential);
  
  return {
    opportunities: allOpportunities,
    marketsScanned: markets.length,
    scanDuration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Calculate expected profit for a given opportunity
 */
export function calculateProfit(
  opportunity: ArbitrageOpportunity, 
  contracts: number
): { grossProfit: number; fees: number; netProfit: number } {
  // Kalshi fee structure (simplified)
  const feePerContract = 0.01; // 1 cent per contract
  const feeCap = 0.07; // 7 cent max per contract
  
  const grossProfit = opportunity.profitPotential * contracts;
  const numTrades = opportunity.executionSteps.length;
  const fees = Math.min(feePerContract * numTrades, feeCap) * contracts;
  
  return {
    grossProfit,
    fees,
    netProfit: grossProfit - fees,
  };
}
