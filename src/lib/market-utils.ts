/**
 * Market utility functions
 *
 * Helper functions for working with Kalshi market data.
 */

import type { Market } from './kalshi';

/**
 * Calculate the implied probability from a price (in cents).
 * Kalshi prices are 1-99 cents representing probability percentages.
 */
export function priceToProb(priceCents: number): number {
  return priceCents / 100;
}

/**
 * Calculate the price from a probability.
 */
export function probToPrice(prob: number): number {
  return Math.round(prob * 100);
}

/**
 * Calculate the mid price for a market.
 */
export function getMidPrice(market: Market): number {
  const bid = market.yes_bid || 0;
  const ask = market.yes_ask || 0;

  if (bid === 0 && ask === 0) return market.last_price || 50;
  if (bid === 0) return ask;
  if (ask === 0) return bid;

  return (bid + ask) / 2;
}

/**
 * Calculate the bid-ask spread for a market (in cents).
 */
export function getSpread(market: Market): number {
  const bid = market.yes_bid || 0;
  const ask = market.yes_ask || 0;

  if (bid === 0 || ask === 0) return Infinity;
  return ask - bid;
}

/**
 * Calculate the spread as a percentage of the mid price.
 */
export function getSpreadPercent(market: Market): number {
  const spread = getSpread(market);
  const mid = getMidPrice(market);

  if (!isFinite(spread) || mid === 0) return Infinity;
  return (spread / mid) * 100;
}

/**
 * Check if a market has acceptable liquidity for trading.
 * Returns true if both bid and ask exist and spread is reasonable.
 */
export function hasLiquidity(market: Market, maxSpreadCents: number = 10): boolean {
  const bid = market.yes_bid || 0;
  const ask = market.yes_ask || 0;

  if (bid === 0 || ask === 0) return false;
  return getSpread(market) <= maxSpreadCents;
}

/**
 * Calculate expected value for a YES bet at current ask price.
 * @param market The market to analyze
 * @param estimatedProb Your estimated probability of YES outcome (0-1)
 * @returns Expected value in cents per contract
 */
export function calculateEV(market: Market, estimatedProb: number): number {
  const askPrice = market.yes_ask || 0;
  if (askPrice === 0) return 0;

  // EV = (prob * payout) - cost
  // Payout is 100 cents if YES wins
  const expectedPayout = estimatedProb * 100;
  return expectedPayout - askPrice;
}

/**
 * Calculate edge (expected value as percentage of cost).
 */
export function calculateEdge(market: Market, estimatedProb: number): number {
  const askPrice = market.yes_ask || 0;
  if (askPrice === 0) return 0;

  const ev = calculateEV(market, estimatedProb);
  return (ev / askPrice) * 100;
}

/**
 * Calculate Kelly criterion optimal bet size.
 * @param prob Your estimated probability (0-1)
 * @param odds The odds you're getting (payout/cost - 1)
 * @returns Optimal fraction of bankroll to bet (0-1)
 */
export function kellyFraction(prob: number, odds: number): number {
  // Kelly = (bp - q) / b
  // where b = odds, p = win prob, q = lose prob
  const q = 1 - prob;
  const kelly = (odds * prob - q) / odds;
  return Math.max(0, kelly);
}

/**
 * Calculate Kelly bet size for a Kalshi market.
 * @param market The market
 * @param estimatedProb Your estimated probability (0-1)
 * @param bankroll Your total bankroll in cents
 * @param fraction Kelly fraction (default 0.25 = quarter Kelly for safety)
 * @returns Recommended bet size in cents
 */
export function calculateKellyBetSize(
  market: Market,
  estimatedProb: number,
  bankroll: number,
  fraction: number = 0.25
): number {
  const askPrice = market.yes_ask || 0;
  if (askPrice === 0 || askPrice >= 100) return 0;

  // Odds = (100 - cost) / cost
  const odds = (100 - askPrice) / askPrice;
  const kelly = kellyFraction(estimatedProb, odds);

  return Math.floor(bankroll * kelly * fraction);
}

/**
 * Format a market for display.
 */
export function formatMarket(market: Market): string {
  const mid = getMidPrice(market);
  const spread = getSpread(market);
  const spreadStr = isFinite(spread) ? `${spread}¢` : 'N/A';

  return `${market.ticker}: ${mid.toFixed(0)}¢ (spread: ${spreadStr})`;
}

/**
 * Format a price in dollars.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format a probability as percentage.
 */
export function formatProb(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}
