// Unrealized P&L Service
// Calculates mark-to-market P&L for open positions using current market prices

import { Position } from '../types/position';
import { PositionCapStorage } from './PositionCapService';

// ─── Types ──────────────────────────────────────────────────────────────

export interface MarketPrice {
  ticker: string;
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
}

export interface MarketPriceProvider {
  getMarketPrices(tickers: string[]): Promise<Map<string, MarketPrice>>;
}

export type PriceSource = 'mid' | 'bid' | 'last';

export interface PositionPnL {
  marketId: string;
  ticker: string;
  side: 'yes' | 'no';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
}

export interface UnrealizedPnLSummary {
  positions: PositionPnL[];
  totalUnrealizedPnl: number;
  lastUpdated: Date;
}

export interface UnrealizedPnLServiceConfig {
  priceSource: PriceSource;
}

export interface UnrealizedPnLServiceEvents {
  onPnLRefreshed?: (summary: UnrealizedPnLSummary) => void;
}

// ─── Service ────────────────────────────────────────────────────────────

export class UnrealizedPnLService {
  private storage: PositionCapStorage;
  private priceProvider: MarketPriceProvider;
  private config: UnrealizedPnLServiceConfig;
  private events: UnrealizedPnLServiceEvents;
  private lastSummary: UnrealizedPnLSummary | null = null;

  constructor(
    storage: PositionCapStorage,
    priceProvider: MarketPriceProvider,
    config: Partial<UnrealizedPnLServiceConfig> = {},
    events: UnrealizedPnLServiceEvents = {}
  ) {
    this.storage = storage;
    this.priceProvider = priceProvider;
    this.config = {
      priceSource: config.priceSource ?? 'mid',
    };
    this.events = events;
  }

  /**
   * Pure calculation of unrealized P&L for a single position.
   * All values in cents.
   *
   * For YES positions: pnl = (currentPrice - avgEntryPrice) × quantity
   * For NO positions:  pnl = (avgEntryPrice - currentPrice) × quantity
   *   (because NO pays out when price goes DOWN)
   */
  calculatePositionPnL(
    position: Position,
    ticker: string,
    currentPrice: number
  ): PositionPnL {
    const { side, quantity, avgPrice } = position;

    let unrealizedPnl: number;
    if (side === 'yes') {
      unrealizedPnl = (currentPrice - avgPrice) * quantity;
    } else {
      unrealizedPnl = (avgPrice - currentPrice) * quantity;
    }

    const costBasis = avgPrice * quantity;
    const unrealizedPnlPct = costBasis > 0 ? (unrealizedPnl / costBasis) * 100 : 0;

    return {
      marketId: position.marketId,
      ticker,
      side,
      quantity,
      avgEntryPrice: avgPrice,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlPct,
    };
  }

  /**
   * Extract the current price from a MarketPrice based on config.
   * For YES side: use yes prices. For NO side: use no prices.
   */
  getCurrentPrice(marketPrice: MarketPrice, side: 'yes' | 'no'): number {
    switch (this.config.priceSource) {
      case 'bid':
        return side === 'yes' ? marketPrice.yesBid : marketPrice.noBid;
      case 'last':
        return marketPrice.lastPrice;
      case 'mid':
      default:
        if (side === 'yes') {
          return (marketPrice.yesBid + marketPrice.yesAsk) / 2;
        }
        return (marketPrice.noBid + marketPrice.noAsk) / 2;
    }
  }

  /**
   * Refresh P&L for all positions. Batch-fetches prices, calculates P&L,
   * updates storage, and returns summary.
   */
  async refreshAll(): Promise<UnrealizedPnLSummary> {
    const positions = await this.storage.getAllPositions();

    if (positions.length === 0) {
      const summary: UnrealizedPnLSummary = {
        positions: [],
        totalUnrealizedPnl: 0,
        lastUpdated: new Date(),
      };
      this.lastSummary = summary;
      if (this.events.onPnLRefreshed) {
        this.events.onPnLRefreshed(summary);
      }
      return summary;
    }

    // Collect unique tickers (marketId is the externalId/ticker)
    const tickers = [...new Set(positions.map((p) => p.marketId))];

    // Batch-fetch prices
    const prices = await this.priceProvider.getMarketPrices(tickers);

    const positionPnLs: PositionPnL[] = [];
    let totalUnrealizedPnl = 0;

    for (const position of positions) {
      if (position.quantity <= 0) continue;

      const marketPrice = prices.get(position.marketId);
      if (!marketPrice) continue;

      const currentPrice = this.getCurrentPrice(marketPrice, position.side);
      const pnl = this.calculatePositionPnL(position, position.marketId, currentPrice);

      positionPnLs.push(pnl);
      totalUnrealizedPnl += pnl.unrealizedPnl;

      // Update position's unrealizedPnl in storage
      await this.storage.upsertPosition({
        ...position,
        unrealizedPnl: pnl.unrealizedPnl,
        updatedAt: new Date(),
      });
    }

    const summary: UnrealizedPnLSummary = {
      positions: positionPnLs,
      totalUnrealizedPnl,
      lastUpdated: new Date(),
    };

    this.lastSummary = summary;
    if (this.events.onPnLRefreshed) {
      this.events.onPnLRefreshed(summary);
    }

    return summary;
  }

  /**
   * Refresh P&L for a single position.
   */
  async refreshPosition(marketId: string, side: 'yes' | 'no'): Promise<PositionPnL | null> {
    const position = await this.storage.getPosition(marketId, side);
    if (!position || position.quantity <= 0) return null;

    const prices = await this.priceProvider.getMarketPrices([marketId]);
    const marketPrice = prices.get(marketId);
    if (!marketPrice) return null;

    const currentPrice = this.getCurrentPrice(marketPrice, side);
    const pnl = this.calculatePositionPnL(position, marketId, currentPrice);

    // Update storage
    await this.storage.upsertPosition({
      ...position,
      unrealizedPnl: pnl.unrealizedPnl,
      updatedAt: new Date(),
    });

    return pnl;
  }

  getLastSummary(): UnrealizedPnLSummary | null {
    return this.lastSummary;
  }

  getPositionPnLs(): PositionPnL[] {
    return this.lastSummary?.positions ?? [];
  }
}
