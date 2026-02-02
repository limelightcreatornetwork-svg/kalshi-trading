// Daily P&L Tracking Service
// Tracks realized + unrealized P&L and triggers kill switch on loss limits

import { KillSwitchService } from './KillSwitchService';
import { KillSwitchLevel, KillSwitchReason } from '../types/killswitch';

export interface DailyPnL {
  id: string;
  date: string;  // YYYY-MM-DD
  
  // P&L components
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  
  // Metrics
  grossPnl: number;    // realizedPnl + unrealizedPnl
  netPnl: number;      // grossPnl - fees
  
  // Trading activity
  tradesCount: number;
  winCount: number;
  lossCount: number;
  
  // Position tracking
  positionsOpened: number;
  positionsClosed: number;
  
  // High water mark tracking
  peakPnl: number;
  drawdown: number;     // peakPnl - netPnl
  drawdownPct: number;  // drawdown as % of peak
  
  createdAt: Date;
  updatedAt: Date;
}

export interface PnLUpdate {
  type: 'fill' | 'position_close' | 'mark_to_market';
  amount: number;
  fee?: number;
  isWin?: boolean;
  marketId?: string;
  orderId?: string;
}

export interface PnLStorage {
  getByDate(date: string): Promise<DailyPnL | null>;
  create(pnl: DailyPnL): Promise<void>;
  update(date: string, updates: Partial<DailyPnL>): Promise<void>;
  getRange(startDate: string, endDate: string): Promise<DailyPnL[]>;
}

// In-memory storage for testing
export class InMemoryPnLStorage implements PnLStorage {
  private records: Map<string, DailyPnL> = new Map();

  async getByDate(date: string): Promise<DailyPnL | null> {
    return this.records.get(date) ?? null;
  }

  async create(pnl: DailyPnL): Promise<void> {
    this.records.set(pnl.date, pnl);
  }

  async update(date: string, updates: Partial<DailyPnL>): Promise<void> {
    const existing = this.records.get(date);
    if (existing) {
      this.records.set(date, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getRange(startDate: string, endDate: string): Promise<DailyPnL[]> {
    return Array.from(this.records.values())
      .filter(r => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  clear(): void {
    this.records.clear();
  }
}

export interface DailyPnLServiceConfig {
  maxDailyLoss: number;       // Max loss before kill switch
  maxDrawdown: number;        // Max drawdown % before kill switch
  killSwitchEnabled: boolean;
}

const DEFAULT_CONFIG: DailyPnLServiceConfig = {
  maxDailyLoss: 500,        // $500 max loss
  maxDrawdown: 0.10,        // 10% max drawdown
  killSwitchEnabled: true,
};

export interface DailyPnLServiceEvents {
  onPnLUpdate?: (pnl: DailyPnL) => void;
  onDrawdownWarning?: (pnl: DailyPnL, pct: number) => void;
  onLossLimitTriggered?: (pnl: DailyPnL) => void;
}

export class DailyPnLService {
  private storage: PnLStorage;
  private config: DailyPnLServiceConfig;
  private events: DailyPnLServiceEvents;
  private killSwitchService?: KillSwitchService;

  constructor(
    storage: PnLStorage,
    config: Partial<DailyPnLServiceConfig> = {},
    events: DailyPnLServiceEvents = {}
  ) {
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
  }

  /**
   * Set kill switch service for automatic triggering
   */
  setKillSwitchService(service: KillSwitchService): void {
    this.killSwitchService = service;
  }

  /**
   * Get today's date string
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get or create today's P&L record
   */
  async getTodayPnL(): Promise<DailyPnL> {
    const today = this.getTodayDate();
    let pnl = await this.storage.getByDate(today);

    if (!pnl) {
      pnl = {
        id: crypto.randomUUID(),
        date: today,
        realizedPnl: 0,
        unrealizedPnl: 0,
        fees: 0,
        grossPnl: 0,
        netPnl: 0,
        tradesCount: 0,
        winCount: 0,
        lossCount: 0,
        positionsOpened: 0,
        positionsClosed: 0,
        peakPnl: 0,
        drawdown: 0,
        drawdownPct: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await this.storage.create(pnl);
    }

    return pnl;
  }

  /**
   * Record a P&L update
   */
  async recordUpdate(update: PnLUpdate): Promise<DailyPnL> {
    const pnl = await this.getTodayPnL();

    switch (update.type) {
      case 'fill':
        // Fill doesn't realize P&L yet, just tracks fees and trades
        pnl.tradesCount++;
        if (update.fee) {
          pnl.fees += update.fee;
        }
        break;

      case 'position_close':
        // Position close realizes P&L
        pnl.realizedPnl += update.amount;
        pnl.positionsClosed++;
        if (update.isWin !== undefined) {
          if (update.isWin) {
            pnl.winCount++;
          } else {
            pnl.lossCount++;
          }
        }
        if (update.fee) {
          pnl.fees += update.fee;
        }
        break;

      case 'mark_to_market':
        // MTM update for unrealized P&L
        pnl.unrealizedPnl = update.amount;
        break;
    }

    // Recalculate totals
    pnl.grossPnl = pnl.realizedPnl + pnl.unrealizedPnl;
    pnl.netPnl = pnl.grossPnl - pnl.fees;

    // Update high water mark and drawdown
    if (pnl.netPnl > pnl.peakPnl) {
      pnl.peakPnl = pnl.netPnl;
    }
    pnl.drawdown = pnl.peakPnl - pnl.netPnl;
    pnl.drawdownPct = pnl.peakPnl > 0 ? pnl.drawdown / pnl.peakPnl : 0;

    await this.storage.update(pnl.date, pnl);

    // Fire events and check thresholds
    if (this.events.onPnLUpdate) {
      this.events.onPnLUpdate(pnl);
    }

    await this.checkThresholds(pnl);

    return pnl;
  }

  /**
   * Record a position opening
   */
  async recordPositionOpen(): Promise<void> {
    const pnl = await this.getTodayPnL();
    pnl.positionsOpened++;
    await this.storage.update(pnl.date, pnl);
  }

  /**
   * Update unrealized P&L for all positions (MTM)
   */
  async updateUnrealizedPnL(totalUnrealized: number): Promise<DailyPnL> {
    return this.recordUpdate({
      type: 'mark_to_market',
      amount: totalUnrealized,
    });
  }

  /**
   * Check if any thresholds are breached
   */
  private async checkThresholds(pnl: DailyPnL): Promise<void> {
    // Check daily loss limit
    if (pnl.netPnl <= -this.config.maxDailyLoss) {
      if (this.events.onLossLimitTriggered) {
        this.events.onLossLimitTriggered(pnl);
      }

      if (this.config.killSwitchEnabled && this.killSwitchService) {
        await this.killSwitchService.trigger({
          level: KillSwitchLevel.GLOBAL,
          reason: KillSwitchReason.LOSS_LIMIT,
          description: `Daily loss limit breached: $${Math.abs(pnl.netPnl).toFixed(2)} loss exceeds $${this.config.maxDailyLoss} limit`,
          triggeredBy: 'system',
        });
      }
    }

    // Check drawdown
    if (pnl.drawdownPct >= this.config.maxDrawdown) {
      if (this.events.onDrawdownWarning) {
        this.events.onDrawdownWarning(pnl, pnl.drawdownPct);
      }

      if (this.config.killSwitchEnabled && this.killSwitchService) {
        await this.killSwitchService.trigger({
          level: KillSwitchLevel.GLOBAL,
          reason: KillSwitchReason.LOSS_LIMIT,
          description: `Drawdown limit breached: ${(pnl.drawdownPct * 100).toFixed(1)}% exceeds ${(this.config.maxDrawdown * 100).toFixed(1)}% limit`,
          triggeredBy: 'system',
        });
      }
    }
  }

  /**
   * Get P&L summary for a date range
   */
  async getPnLRange(
    startDate: string,
    endDate: string
  ): Promise<{
    records: DailyPnL[];
    summary: {
      totalRealizedPnl: number;
      totalFees: number;
      totalNetPnl: number;
      totalTrades: number;
      winRate: number;
      avgDailyPnl: number;
      maxDrawdown: number;
    };
  }> {
    const records = await this.storage.getRange(startDate, endDate);

    if (records.length === 0) {
      return {
        records: [],
        summary: {
          totalRealizedPnl: 0,
          totalFees: 0,
          totalNetPnl: 0,
          totalTrades: 0,
          winRate: 0,
          avgDailyPnl: 0,
          maxDrawdown: 0,
        },
      };
    }

    const totalRealizedPnl = records.reduce((sum, r) => sum + r.realizedPnl, 0);
    const totalFees = records.reduce((sum, r) => sum + r.fees, 0);
    const totalNetPnl = records.reduce((sum, r) => sum + r.netPnl, 0);
    const totalTrades = records.reduce((sum, r) => sum + r.tradesCount, 0);
    const totalWins = records.reduce((sum, r) => sum + r.winCount, 0);
    const totalLosses = records.reduce((sum, r) => sum + r.lossCount, 0);
    const maxDrawdown = Math.max(...records.map(r => r.drawdownPct));

    return {
      records,
      summary: {
        totalRealizedPnl,
        totalFees,
        totalNetPnl,
        totalTrades,
        winRate: (totalWins + totalLosses) > 0 
          ? totalWins / (totalWins + totalLosses) 
          : 0,
        avgDailyPnl: totalNetPnl / records.length,
        maxDrawdown,
      },
    };
  }

  /**
   * Check current risk status
   */
  async getRiskStatus(): Promise<{
    dailyLoss: number;
    dailyLossLimit: number;
    dailyLossUtilization: number;
    drawdown: number;
    drawdownLimit: number;
    drawdownUtilization: number;
    isSafe: boolean;
    warnings: string[];
  }> {
    const pnl = await this.getTodayPnL();
    
    const dailyLoss = Math.max(0, -pnl.netPnl);
    const dailyLossUtilization = dailyLoss / this.config.maxDailyLoss;
    const drawdownUtilization = pnl.drawdownPct / this.config.maxDrawdown;
    
    const warnings: string[] = [];
    
    if (dailyLossUtilization > 0.8) {
      warnings.push(`Daily loss at ${(dailyLossUtilization * 100).toFixed(0)}% of limit`);
    }
    
    if (drawdownUtilization > 0.8) {
      warnings.push(`Drawdown at ${(drawdownUtilization * 100).toFixed(0)}% of limit`);
    }
    
    const isSafe = dailyLossUtilization < 1 && drawdownUtilization < 1;

    return {
      dailyLoss,
      dailyLossLimit: this.config.maxDailyLoss,
      dailyLossUtilization,
      drawdown: pnl.drawdownPct,
      drawdownLimit: this.config.maxDrawdown,
      drawdownUtilization,
      isSafe,
      warnings,
    };
  }
}

// Factory function
export function createDailyPnLService(
  config: Partial<DailyPnLServiceConfig> = {},
  events: DailyPnLServiceEvents = {}
): DailyPnLService {
  return new DailyPnLService(new InMemoryPnLStorage(), config, events);
}
