// Position Cap Service
// Implements Tier 1 Feature #19: Per-market position caps

import {
  Market,
  Position,
  PositionCap,
  CapType,
  PositionCapCheckRequest,
  PositionCapCheckResult,
  RISK_TIER_MULTIPLIERS,
  CreateMarketRequest,
  UpdateMarketRequest,
  MarketStatus,
} from '../types/position';

export interface PositionCapStorage {
  getMarket(id: string): Promise<Market | null>;
  getMarketByExternalId(externalId: string): Promise<Market | null>;
  createMarket(market: Market): Promise<void>;
  updateMarket(id: string, updates: Partial<Market>): Promise<void>;
  getPosition(marketId: string, side: string): Promise<Position | null>;
  getAllPositions(): Promise<Position[]>;
  upsertPosition(position: Position): Promise<void>;
  getCaps(marketId?: string): Promise<PositionCap[]>;
  upsertCap(cap: PositionCap): Promise<void>;
  getGlobalCaps(): Promise<PositionCap[]>;
  getTotalPortfolioValue(): Promise<number>;
}

export interface PositionCapServiceEvents {
  onSoftLimitWarning?: (cap: PositionCap, currentValue: number) => void;
  onHardLimitBlocked?: (cap: PositionCap, requestedValue: number) => void;
  onPositionUpdate?: (position: Position) => void;
}

export class PositionCapService {
  private storage: PositionCapStorage;
  private events: PositionCapServiceEvents;

  constructor(storage: PositionCapStorage, events: PositionCapServiceEvents = {}) {
    this.storage = storage;
    this.events = events;
  }

  /**
   * Create or get a market
   */
  async ensureMarket(request: CreateMarketRequest): Promise<Market> {
    const existing = await this.storage.getMarketByExternalId(request.externalId);
    if (existing) {
      return existing;
    }

    const market: Market = {
      id: crypto.randomUUID(),
      externalId: request.externalId,
      title: request.title,
      category: request.category,
      status: MarketStatus.OPEN,
      maxPositionSize: request.maxPositionSize ?? 1000,
      maxNotional: request.maxNotional ?? 10000,
      currentPosition: 0,
      riskTier: request.riskTier ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.createMarket(market);
    return market;
  }

  /**
   * Update market configuration
   */
  async updateMarket(marketId: string, updates: UpdateMarketRequest): Promise<Market | null> {
    const market = await this.storage.getMarket(marketId);
    if (!market) return null;

    await this.storage.updateMarket(marketId, updates);
    return this.storage.getMarket(marketId);
  }

  /**
   * Check if an order would violate any position caps
   */
  async checkCaps(request: PositionCapCheckRequest): Promise<PositionCapCheckResult> {
    const market = await this.storage.getMarket(request.marketId);
    if (!market) {
      return {
        allowed: false,
        reason: 'Market not found',
        caps: [],
      };
    }

    // Get current position
    const currentPosition = await this.storage.getPosition(request.marketId, request.side);
    const currentQty = currentPosition?.quantity ?? 0;
    const newQty = currentQty + request.quantity;

    // Calculate notional value
    const notionalValue = newQty * request.price;

    // Get portfolio value for percentage calculations
    const portfolioValue = await this.storage.getTotalPortfolioValue();

    // Get all applicable caps
    const marketCaps = await this.storage.getCaps(request.marketId);
    const globalCaps = await this.storage.getGlobalCaps();
    const allCaps = [...marketCaps, ...globalCaps];

    const capResults: PositionCapCheckResult['caps'] = [];
    let blocked = false;
    let blockReason: string | undefined;

    // Check market-level limits from market config
    const riskMultiplier = RISK_TIER_MULTIPLIERS[market.riskTier] ?? 1;
    const adjustedMaxPosition = market.maxPositionSize * riskMultiplier;
    const adjustedMaxNotional = market.maxNotional * riskMultiplier;

    // Market position size check
    capResults.push({
      type: CapType.ABSOLUTE,
      current: currentQty,
      softLimit: adjustedMaxPosition * 0.8, // 80% soft limit
      hardLimit: adjustedMaxPosition,
      wouldExceedSoft: newQty > adjustedMaxPosition * 0.8,
      wouldExceedHard: newQty > adjustedMaxPosition,
    });

    if (newQty > adjustedMaxPosition) {
      blocked = true;
      blockReason = `Position ${newQty} exceeds max ${adjustedMaxPosition} for market`;
    }

    // Market notional check
    capResults.push({
      type: CapType.NOTIONAL,
      current: currentQty * request.price,
      softLimit: adjustedMaxNotional * 0.8,
      hardLimit: adjustedMaxNotional,
      wouldExceedSoft: notionalValue > adjustedMaxNotional * 0.8,
      wouldExceedHard: notionalValue > adjustedMaxNotional,
    });

    if (notionalValue > adjustedMaxNotional) {
      blocked = true;
      blockReason = `Notional $${notionalValue.toFixed(2)} exceeds max $${adjustedMaxNotional.toFixed(2)} for market`;
    }

    // Check each configured cap
    for (const cap of allCaps) {
      if (!cap.isActive) continue;

      let currentValue: number;
      let newValue: number;

      switch (cap.capType) {
        case CapType.ABSOLUTE:
          currentValue = currentQty;
          newValue = newQty;
          break;
        case CapType.PERCENTAGE:
          currentValue = (currentQty * request.price) / portfolioValue;
          newValue = notionalValue / portfolioValue;
          break;
        case CapType.NOTIONAL:
          currentValue = currentQty * request.price;
          newValue = notionalValue;
          break;
        default:
          continue;
      }

      const wouldExceedSoft = newValue > cap.softLimit;
      const wouldExceedHard = newValue > cap.hardLimit;

      capResults.push({
        type: cap.capType,
        current: currentValue,
        softLimit: cap.softLimit,
        hardLimit: cap.hardLimit,
        wouldExceedSoft,
        wouldExceedHard,
      });

      if (wouldExceedSoft && this.events.onSoftLimitWarning) {
        this.events.onSoftLimitWarning(cap, newValue);
      }

      if (wouldExceedHard) {
        blocked = true;
        blockReason = `${cap.capType} cap exceeded: ${newValue.toFixed(4)} > ${cap.hardLimit}`;
        if (this.events.onHardLimitBlocked) {
          this.events.onHardLimitBlocked(cap, newValue);
        }
      }
    }

    return {
      allowed: !blocked,
      reason: blockReason,
      caps: capResults,
    };
  }

  /**
   * Update position after a fill
   */
  async updatePosition(
    marketId: string,
    side: 'yes' | 'no',
    fillQty: number,
    fillPrice: number
  ): Promise<Position> {
    const existing = await this.storage.getPosition(marketId, side);
    
    if (existing) {
      // Update existing position
      const newQty = existing.quantity + fillQty;
      const newAvgPrice = 
        (existing.avgPrice * existing.quantity + fillPrice * fillQty) / newQty;

      const updated: Position = {
        ...existing,
        quantity: newQty,
        avgPrice: newAvgPrice,
        updatedAt: new Date(),
      };

      await this.storage.upsertPosition(updated);

      // Update market's current position
      await this.storage.updateMarket(marketId, {
        currentPosition: newQty,
      });

      if (this.events.onPositionUpdate) {
        this.events.onPositionUpdate(updated);
      }

      return updated;
    }

    // Create new position
    const position: Position = {
      id: crypto.randomUUID(),
      marketId,
      side,
      quantity: fillQty,
      avgPrice: fillPrice,
      realizedPnl: 0,
      unrealizedPnl: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.upsertPosition(position);

    // Update market's current position
    await this.storage.updateMarket(marketId, {
      currentPosition: fillQty,
    });

    if (this.events.onPositionUpdate) {
      this.events.onPositionUpdate(position);
    }

    return position;
  }

  /**
   * Set a position cap
   */
  async setCap(
    capType: CapType,
    softLimit: number,
    hardLimit: number,
    marketId?: string
  ): Promise<PositionCap> {
    const cap: PositionCap = {
      id: crypto.randomUUID(),
      marketId,
      capType,
      softLimit,
      hardLimit,
      currentValue: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.upsertCap(cap);
    return cap;
  }

  /**
   * Calculate the maximum allowed order size given current caps
   */
  async getMaxOrderSize(
    marketId: string,
    side: 'yes' | 'no',
    price: number
  ): Promise<number> {
    const market = await this.storage.getMarket(marketId);
    if (!market) return 0;

    const currentPosition = await this.storage.getPosition(marketId, side);
    const currentQty = currentPosition?.quantity ?? 0;

    // Get risk-adjusted limits
    const riskMultiplier = RISK_TIER_MULTIPLIERS[market.riskTier] ?? 1;
    const maxPosition = market.maxPositionSize * riskMultiplier;
    const maxNotional = market.maxNotional * riskMultiplier;

    // Max based on position size
    const maxByPosition = maxPosition - currentQty;
    
    // Max based on notional
    const currentNotional = currentQty * price;
    const maxByNotional = (maxNotional - currentNotional) / price;

    // Return the minimum of all limits
    return Math.max(0, Math.min(maxByPosition, maxByNotional));
  }

  /**
   * Get position summary for a market
   */
  async getPositionSummary(marketId: string): Promise<{
    market: Market;
    yesPosition?: Position;
    noPosition?: Position;
    netExposure: number;
    totalNotional: number;
    utilizationPct: number;
  } | null> {
    const market = await this.storage.getMarket(marketId);
    if (!market) return null;

    const yesPosition = await this.storage.getPosition(marketId, 'yes');
    const noPosition = await this.storage.getPosition(marketId, 'no');

    const yesQty = yesPosition?.quantity ?? 0;
    const noQty = noPosition?.quantity ?? 0;
    const yesNotional = yesQty * (yesPosition?.avgPrice ?? 0);
    const noNotional = noQty * (noPosition?.avgPrice ?? 0);

    const netExposure = yesQty - noQty;
    const totalNotional = yesNotional + noNotional;
    const riskMultiplier = RISK_TIER_MULTIPLIERS[market.riskTier] ?? 1;
    const maxNotional = market.maxNotional * riskMultiplier;
    const utilizationPct = maxNotional > 0 ? (totalNotional / maxNotional) * 100 : 0;

    return {
      market,
      yesPosition: yesPosition ?? undefined,
      noPosition: noPosition ?? undefined,
      netExposure,
      totalNotional,
      utilizationPct,
    };
  }
}

