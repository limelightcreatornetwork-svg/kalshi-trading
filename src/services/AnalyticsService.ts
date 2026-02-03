/**
 * Analytics Service - Portfolio P&L Tracking & Analysis
 * 
 * Features:
 * - Daily portfolio snapshots
 * - Position performance breakdown
 * - Win/loss statistics with advanced metrics (Sharpe ratio, profit factor)
 * - Historical P&L tracking
 */

// Types for analytics
export interface DailySnapshot {
  id: string;
  date: string;  // YYYY-MM-DD
  portfolioValue: number;
  cashBalance: number;
  positionValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
  dailyPnL: number;
  openPositions: number;
  closedPositions: number;
  highWaterMark: number;
  drawdownAmount: number;
  drawdownPercent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeHistory {
  id: string;
  marketTicker: string;
  marketTitle: string | null;
  side: string;
  direction: string;
  entryPrice: number;
  entryQuantity: number;
  entryValue: number;
  entryDate: Date;
  exitPrice: number | null;
  exitQuantity: number | null;
  exitValue: number | null;
  exitDate: Date | null;
  currentPrice: number | null;
  currentQuantity: number | null;
  realizedPnL: number;
  unrealizedPnL: number;
  fees: number;
  netPnL: number;
  pnlPercent: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN';
  holdingPeriod: number | null;
  strategyId: string | null;
  thesisId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PositionPerformance {
  id: string;
  marketTicker: string;
  marketTitle: string | null;
  side: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  unrealizedPnL: number;
  isOpen: boolean;
  entryDate: Date;
  exitDate: Date | null;
  holdingDays: number;
}

export interface WinLossStats {
  // Basic stats
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number;
  
  // P&L metrics
  totalPnL: number;
  totalRealizedPnL: number;
  totalUnrealizedPnL: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
  
  // Advanced metrics
  profitFactor: number;  // Gross profit / Gross loss
  sharpeRatio: number;   // Risk-adjusted return
  sortinoRatio: number;  // Downside risk-adjusted return
  expectancy: number;    // (Win% * Avg Win) - (Loss% * Avg Loss)
  
  // Drawdown
  maxDrawdown: number;
  maxDrawdownPercent: number;
  currentDrawdown: number;
  
  // Holding period
  avgHoldingDays: number;
  avgWinHoldingDays: number;
  avgLossHoldingDays: number;
}

export interface SnapshotHistoryQuery {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface StatsTimeFilter {
  period: '7d' | '30d' | '90d' | 'all';
}

// Storage interfaces for dependency injection
export interface SnapshotStorage {
  getByDate(date: string): Promise<DailySnapshot | null>;
  getRange(startDate: string, endDate: string, limit?: number): Promise<DailySnapshot[]>;
  create(snapshot: DailySnapshot): Promise<void>;
  update(date: string, updates: Partial<DailySnapshot>): Promise<void>;
  getLatest(): Promise<DailySnapshot | null>;
}

export interface TradeStorage {
  getAll(): Promise<TradeHistory[]>;
  getByResult(result: TradeHistory['result']): Promise<TradeHistory[]>;
  getByDateRange(startDate: Date, endDate: Date): Promise<TradeHistory[]>;
  getById(id: string): Promise<TradeHistory | null>;
  create(trade: TradeHistory): Promise<void>;
  update(id: string, updates: Partial<TradeHistory>): Promise<void>;
  getOpenTrades(): Promise<TradeHistory[]>;
  getClosedTrades(): Promise<TradeHistory[]>;
}

// In-memory storage implementations for testing
export class InMemorySnapshotStorage implements SnapshotStorage {
  private snapshots: Map<string, DailySnapshot> = new Map();

  async getByDate(date: string): Promise<DailySnapshot | null> {
    return this.snapshots.get(date) ?? null;
  }

  async getRange(startDate: string, endDate: string, limit?: number): Promise<DailySnapshot[]> {
    const result = Array.from(this.snapshots.values())
      .filter(s => s.date >= startDate && s.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return limit ? result.slice(0, limit) : result;
  }

  async create(snapshot: DailySnapshot): Promise<void> {
    this.snapshots.set(snapshot.date, snapshot);
  }

  async update(date: string, updates: Partial<DailySnapshot>): Promise<void> {
    const existing = this.snapshots.get(date);
    if (existing) {
      this.snapshots.set(date, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getLatest(): Promise<DailySnapshot | null> {
    const sorted = Array.from(this.snapshots.values())
      .sort((a, b) => b.date.localeCompare(a.date));
    return sorted[0] ?? null;
  }

  clear(): void {
    this.snapshots.clear();
  }
}

export class InMemoryTradeStorage implements TradeStorage {
  private trades: Map<string, TradeHistory> = new Map();

  async getAll(): Promise<TradeHistory[]> {
    return Array.from(this.trades.values());
  }

  async getByResult(result: TradeHistory['result']): Promise<TradeHistory[]> {
    return Array.from(this.trades.values()).filter(t => t.result === result);
  }

  async getByDateRange(startDate: Date, endDate: Date): Promise<TradeHistory[]> {
    return Array.from(this.trades.values()).filter(t => {
      const tradeDate = t.exitDate ?? t.entryDate;
      return tradeDate >= startDate && tradeDate <= endDate;
    });
  }

  async getById(id: string): Promise<TradeHistory | null> {
    return this.trades.get(id) ?? null;
  }

  async create(trade: TradeHistory): Promise<void> {
    this.trades.set(trade.id, trade);
  }

  async update(id: string, updates: Partial<TradeHistory>): Promise<void> {
    const existing = this.trades.get(id);
    if (existing) {
      this.trades.set(id, { ...existing, ...updates, updatedAt: new Date() });
    }
  }

  async getOpenTrades(): Promise<TradeHistory[]> {
    return Array.from(this.trades.values()).filter(t => t.result === 'OPEN');
  }

  async getClosedTrades(): Promise<TradeHistory[]> {
    return Array.from(this.trades.values()).filter(t => t.result !== 'OPEN');
  }

  clear(): void {
    this.trades.clear();
  }
}

// Portfolio data provider interface (to fetch from Kalshi or mock)
export interface PortfolioDataProvider {
  getBalance(): Promise<{ balance: number; portfolioValue: number }>;
  getPositions(): Promise<Array<{
    ticker: string;
    position: number;
    marketExposure: number;
    realizedPnl: number;
  }>>;
}

export interface AnalyticsServiceConfig {
  riskFreeRate: number;  // For Sharpe ratio calculation (annualized)
}

const DEFAULT_CONFIG: AnalyticsServiceConfig = {
  riskFreeRate: 0.05,  // 5% annual risk-free rate
};

export class AnalyticsService {
  private snapshotStorage: SnapshotStorage;
  private tradeStorage: TradeStorage;
  private config: AnalyticsServiceConfig;
  private portfolioProvider?: PortfolioDataProvider;

  constructor(
    snapshotStorage: SnapshotStorage,
    tradeStorage: TradeStorage,
    config: Partial<AnalyticsServiceConfig> = {}
  ) {
    this.snapshotStorage = snapshotStorage;
    this.tradeStorage = tradeStorage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setPortfolioProvider(provider: PortfolioDataProvider): void {
    this.portfolioProvider = provider;
  }

  /**
   * Get current date string in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(start: Date, end: Date): number {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculate date N days ago
   */
  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }

  // =========================================================================
  // Daily Snapshot Methods
  // =========================================================================

  /**
   * Create or update today's daily snapshot
   */
  async createDailySnapshot(data: {
    portfolioValue: number;
    cashBalance: number;
    positionValue: number;
    realizedPnL: number;
    unrealizedPnL: number;
    openPositions: number;
    closedPositions: number;
  }): Promise<DailySnapshot> {
    const today = this.getTodayDate();
    const previousSnapshot = await this.snapshotStorage.getLatest();
    
    // Calculate daily P&L change
    const dailyPnL = previousSnapshot 
      ? (data.realizedPnL + data.unrealizedPnL) - (previousSnapshot.realizedPnL + previousSnapshot.unrealizedPnL)
      : data.realizedPnL + data.unrealizedPnL;

    // Calculate high water mark and drawdown
    const previousHWM = previousSnapshot?.highWaterMark ?? 0;
    const highWaterMark = Math.max(previousHWM, data.portfolioValue);
    const drawdownAmount = highWaterMark - data.portfolioValue;
    const drawdownPercent = highWaterMark > 0 ? drawdownAmount / highWaterMark : 0;

    const snapshot: DailySnapshot = {
      id: crypto.randomUUID(),
      date: today,
      portfolioValue: data.portfolioValue,
      cashBalance: data.cashBalance,
      positionValue: data.positionValue,
      realizedPnL: data.realizedPnL,
      unrealizedPnL: data.unrealizedPnL,
      dailyPnL,
      openPositions: data.openPositions,
      closedPositions: data.closedPositions,
      highWaterMark,
      drawdownAmount,
      drawdownPercent,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = await this.snapshotStorage.getByDate(today);
    if (existing) {
      await this.snapshotStorage.update(today, snapshot);
    } else {
      await this.snapshotStorage.create(snapshot);
    }

    return snapshot;
  }

  /**
   * Get daily snapshot history with optional date range filter
   */
  async getSnapshotHistory(query: SnapshotHistoryQuery = {}): Promise<{
    snapshots: DailySnapshot[];
    summary: {
      startValue: number;
      endValue: number;
      totalReturn: number;
      totalReturnPercent: number;
      maxDrawdown: number;
      avgDailyReturn: number;
    };
  }> {
    const endDate = query.endDate ?? this.getTodayDate();
    const startDate = query.startDate ?? this.getDateDaysAgo(30);
    
    const snapshots = await this.snapshotStorage.getRange(startDate, endDate, query.limit);
    
    if (snapshots.length === 0) {
      return {
        snapshots: [],
        summary: {
          startValue: 0,
          endValue: 0,
          totalReturn: 0,
          totalReturnPercent: 0,
          maxDrawdown: 0,
          avgDailyReturn: 0,
        },
      };
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const totalReturn = last.portfolioValue - first.portfolioValue;
    const totalReturnPercent = first.portfolioValue > 0 
      ? (totalReturn / first.portfolioValue) * 100 
      : 0;
    const maxDrawdown = Math.max(...snapshots.map(s => s.drawdownPercent));
    const avgDailyReturn = snapshots.length > 1
      ? snapshots.reduce((sum, s) => sum + s.dailyPnL, 0) / snapshots.length
      : 0;

    return {
      snapshots,
      summary: {
        startValue: first.portfolioValue,
        endValue: last.portfolioValue,
        totalReturn,
        totalReturnPercent,
        maxDrawdown,
        avgDailyReturn,
      },
    };
  }

  /**
   * Auto-capture snapshot using portfolio provider
   */
  async captureSnapshot(): Promise<DailySnapshot | null> {
    if (!this.portfolioProvider) {
      throw new Error('Portfolio provider not configured');
    }

    const [balanceData, positions] = await Promise.all([
      this.portfolioProvider.getBalance(),
      this.portfolioProvider.getPositions(),
    ]);

    const openPositions = positions.filter(p => p.position !== 0);
    const positionValue = openPositions.reduce((sum, p) => sum + p.marketExposure, 0);
    const realizedPnL = positions.reduce((sum, p) => sum + p.realizedPnl, 0);
    const unrealizedPnL = balanceData.portfolioValue - balanceData.balance - realizedPnL;

    return this.createDailySnapshot({
      portfolioValue: balanceData.portfolioValue,
      cashBalance: balanceData.balance,
      positionValue,
      realizedPnL,
      unrealizedPnL,
      openPositions: openPositions.length,
      closedPositions: 0,  // This would need to be tracked separately
    });
  }

  // =========================================================================
  // Position Performance Methods
  // =========================================================================

  /**
   * Record a new trade entry
   */
  async recordTradeEntry(data: {
    marketTicker: string;
    marketTitle?: string;
    side: string;
    entryPrice: number;
    entryQuantity: number;
    entryValue: number;
    strategyId?: string;
    thesisId?: string;
  }): Promise<TradeHistory> {
    const trade: TradeHistory = {
      id: crypto.randomUUID(),
      marketTicker: data.marketTicker,
      marketTitle: data.marketTitle ?? null,
      side: data.side,
      direction: data.side === 'yes' ? 'long' : 'short',
      entryPrice: data.entryPrice,
      entryQuantity: data.entryQuantity,
      entryValue: data.entryValue,
      entryDate: new Date(),
      exitPrice: null,
      exitQuantity: null,
      exitValue: null,
      exitDate: null,
      currentPrice: data.entryPrice,
      currentQuantity: data.entryQuantity,
      realizedPnL: 0,
      unrealizedPnL: 0,
      fees: 0,
      netPnL: 0,
      pnlPercent: 0,
      result: 'OPEN',
      holdingPeriod: null,
      strategyId: data.strategyId ?? null,
      thesisId: data.thesisId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.tradeStorage.create(trade);
    return trade;
  }

  /**
   * Update trade with current market price (for unrealized P&L)
   */
  async updateTradePrice(tradeId: string, currentPrice: number): Promise<TradeHistory | null> {
    const trade = await this.tradeStorage.getById(tradeId);
    if (!trade || trade.result !== 'OPEN') return null;

    const currentQuantity = trade.currentQuantity ?? trade.entryQuantity;
    const pnlPerContract = currentPrice - trade.entryPrice;
    const unrealizedPnL = pnlPerContract * currentQuantity;
    const netPnL = unrealizedPnL - trade.fees;
    const pnlPercent = trade.entryValue > 0 ? (netPnL / trade.entryValue) * 100 : 0;

    await this.tradeStorage.update(tradeId, {
      currentPrice,
      unrealizedPnL,
      netPnL,
      pnlPercent,
    });

    return { ...trade, currentPrice, unrealizedPnL, netPnL, pnlPercent };
  }

  /**
   * Close a trade (partial or full)
   */
  async closeTrade(tradeId: string, data: {
    exitPrice: number;
    exitQuantity: number;
    exitValue: number;
    fees?: number;
  }): Promise<TradeHistory | null> {
    const trade = await this.tradeStorage.getById(tradeId);
    if (!trade) return null;

    const exitDate = new Date();
    const holdingPeriod = this.daysBetween(trade.entryDate, exitDate);
    const pnlPerContract = data.exitPrice - trade.entryPrice;
    const realizedPnL = pnlPerContract * data.exitQuantity;
    const totalFees = trade.fees + (data.fees ?? 0);
    const netPnL = realizedPnL - totalFees;
    const pnlPercent = trade.entryValue > 0 ? (netPnL / trade.entryValue) * 100 : 0;

    // Determine result
    let result: TradeHistory['result'];
    if (netPnL > 0.01) {
      result = 'WIN';
    } else if (netPnL < -0.01) {
      result = 'LOSS';
    } else {
      result = 'BREAKEVEN';
    }

    const remainingQty = trade.entryQuantity - data.exitQuantity;
    const isFullyExited = remainingQty <= 0;

    await this.tradeStorage.update(tradeId, {
      exitPrice: data.exitPrice,
      exitQuantity: data.exitQuantity,
      exitValue: data.exitValue,
      exitDate,
      currentPrice: data.exitPrice,
      currentQuantity: isFullyExited ? 0 : remainingQty,
      realizedPnL,
      unrealizedPnL: 0,
      fees: totalFees,
      netPnL,
      pnlPercent,
      result: isFullyExited ? result : 'OPEN',
      holdingPeriod,
    });

    return {
      ...trade,
      exitPrice: data.exitPrice,
      exitQuantity: data.exitQuantity,
      exitValue: data.exitValue,
      exitDate,
      realizedPnL,
      fees: totalFees,
      netPnL,
      pnlPercent,
      result: isFullyExited ? result : 'OPEN',
      holdingPeriod,
    };
  }

  /**
   * Get position performance breakdown
   */
  async getPositionPerformance(includesClosed: boolean = true): Promise<PositionPerformance[]> {
    const trades = includesClosed 
      ? await this.tradeStorage.getAll()
      : await this.tradeStorage.getOpenTrades();

    return trades.map(trade => {
      const currentPrice = trade.currentPrice ?? trade.exitPrice ?? trade.entryPrice;
      const quantity = trade.currentQuantity ?? trade.entryQuantity;
      const pnl = trade.netPnL;
      const pnlPercent = trade.pnlPercent;
      const holdingDays = trade.holdingPeriod ?? this.daysBetween(trade.entryDate, new Date());

      return {
        id: trade.id,
        marketTicker: trade.marketTicker,
        marketTitle: trade.marketTitle,
        side: trade.side,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        currentPrice,
        quantity,
        pnl,
        pnlPercent,
        unrealizedPnL: trade.unrealizedPnL,
        isOpen: trade.result === 'OPEN',
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        holdingDays,
      };
    });
  }

  // =========================================================================
  // Win/Loss Statistics Methods
  // =========================================================================

  /**
   * Calculate comprehensive win/loss statistics
   */
  async calculateStats(filter: StatsTimeFilter = { period: 'all' }): Promise<WinLossStats> {
    const allTrades = await this.tradeStorage.getAll();
    
    // Apply time filter
    let filteredTrades = allTrades;
    if (filter.period !== 'all') {
      const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysMap[filter.period]);
      
      filteredTrades = allTrades.filter(t => {
        const tradeDate = t.exitDate ?? t.entryDate;
        return tradeDate >= cutoffDate;
      });
    }

    const openTrades = filteredTrades.filter(t => t.result === 'OPEN');
    const closedTrades = filteredTrades.filter(t => t.result !== 'OPEN');
    const wins = closedTrades.filter(t => t.result === 'WIN');
    const losses = closedTrades.filter(t => t.result === 'LOSS');
    const breakevens = closedTrades.filter(t => t.result === 'BREAKEVEN');

    // Basic counts
    const totalTrades = filteredTrades.length;
    const winCount = wins.length;
    const lossCount = losses.length;
    const breakevenCount = breakevens.length;
    const winRate = closedTrades.length > 0 ? winCount / closedTrades.length : 0;

    // P&L metrics
    const totalRealizedPnL = closedTrades.reduce((sum, t) => sum + t.netPnL, 0);
    const totalUnrealizedPnL = openTrades.reduce((sum, t) => sum + t.unrealizedPnL, 0);
    const totalPnL = totalRealizedPnL + totalUnrealizedPnL;
    const avgPnL = closedTrades.length > 0 ? totalRealizedPnL / closedTrades.length : 0;

    const totalWinPnL = wins.reduce((sum, t) => sum + t.netPnL, 0);
    const totalLossPnL = Math.abs(losses.reduce((sum, t) => sum + t.netPnL, 0));
    const avgWin = winCount > 0 ? totalWinPnL / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLossPnL / lossCount : 0;

    const winPnLs = wins.map(t => t.netPnL);
    const lossPnLs = losses.map(t => t.netPnL);
    const largestWin = winPnLs.length > 0 ? Math.max(...winPnLs) : 0;
    const largestLoss = lossPnLs.length > 0 ? Math.min(...lossPnLs) : 0;

    // Advanced metrics
    const profitFactor = totalLossPnL > 0 ? totalWinPnL / totalLossPnL : totalWinPnL > 0 ? Infinity : 0;
    const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

    // Sharpe ratio (using daily returns from snapshots)
    const snapshots = await this.snapshotStorage.getRange(
      this.getDateDaysAgo(filter.period === 'all' ? 365 : { '7d': 7, '30d': 30, '90d': 90 }[filter.period]),
      this.getTodayDate()
    );
    const sharpeRatio = this.calculateSharpeRatio(snapshots);
    const sortinoRatio = this.calculateSortinoRatio(snapshots);

    // Drawdown
    const maxDrawdownPercent = snapshots.length > 0 
      ? Math.max(...snapshots.map(s => s.drawdownPercent)) 
      : 0;
    const maxDrawdown = snapshots.length > 0 
      ? Math.max(...snapshots.map(s => s.drawdownAmount)) 
      : 0;
    const currentDrawdown = snapshots.length > 0 
      ? snapshots[snapshots.length - 1].drawdownPercent 
      : 0;

    // Holding period stats
    const closedWithHolding = closedTrades.filter(t => t.holdingPeriod !== null);
    const avgHoldingDays = closedWithHolding.length > 0
      ? closedWithHolding.reduce((sum, t) => sum + (t.holdingPeriod ?? 0), 0) / closedWithHolding.length
      : 0;
    const winsWithHolding = wins.filter(t => t.holdingPeriod !== null);
    const avgWinHoldingDays = winsWithHolding.length > 0
      ? winsWithHolding.reduce((sum, t) => sum + (t.holdingPeriod ?? 0), 0) / winsWithHolding.length
      : 0;
    const lossesWithHolding = losses.filter(t => t.holdingPeriod !== null);
    const avgLossHoldingDays = lossesWithHolding.length > 0
      ? lossesWithHolding.reduce((sum, t) => sum + (t.holdingPeriod ?? 0), 0) / lossesWithHolding.length
      : 0;

    return {
      totalTrades,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      winCount,
      lossCount,
      breakevenCount,
      winRate,
      totalPnL,
      totalRealizedPnL,
      totalUnrealizedPnL,
      avgPnL,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      expectancy,
      maxDrawdown,
      maxDrawdownPercent,
      currentDrawdown,
      avgHoldingDays,
      avgWinHoldingDays,
      avgLossHoldingDays,
    };
  }

  /**
   * Calculate annualized Sharpe ratio from daily snapshots
   */
  private calculateSharpeRatio(snapshots: DailySnapshot[]): number {
    if (snapshots.length < 2) return 0;

    // Calculate daily returns
    const dailyReturns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].portfolioValue;
      if (prevValue > 0) {
        const dailyReturn = (snapshots[i].portfolioValue - prevValue) / prevValue;
        dailyReturns.push(dailyReturn);
      }
    }

    if (dailyReturns.length === 0) return 0;

    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualize (assuming 252 trading days)
    const annualizedReturn = avgReturn * 252;
    const annualizedStdDev = stdDev * Math.sqrt(252);
    const dailyRiskFreeRate = this.config.riskFreeRate / 252;
    const annualizedExcessReturn = annualizedReturn - this.config.riskFreeRate;

    // Sharpe = (Return - RiskFreeRate) / StdDev
    return annualizedExcessReturn / annualizedStdDev;
  }

  /**
   * Calculate Sortino ratio (only considers downside volatility)
   */
  private calculateSortinoRatio(snapshots: DailySnapshot[]): number {
    if (snapshots.length < 2) return 0;

    // Calculate daily returns
    const dailyReturns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prevValue = snapshots[i - 1].portfolioValue;
      if (prevValue > 0) {
        const dailyReturn = (snapshots[i].portfolioValue - prevValue) / prevValue;
        dailyReturns.push(dailyReturn);
      }
    }

    if (dailyReturns.length === 0) return 0;

    const dailyRiskFreeRate = this.config.riskFreeRate / 252;
    const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

    // Only consider negative returns for downside deviation
    const negativeReturns = dailyReturns.filter(r => r < dailyRiskFreeRate);
    if (negativeReturns.length === 0) return Infinity; // No downside risk

    const downsideVariance = negativeReturns.reduce(
      (sum, r) => sum + Math.pow(r - dailyRiskFreeRate, 2), 
      0
    ) / negativeReturns.length;
    const downsideDeviation = Math.sqrt(downsideVariance);

    if (downsideDeviation === 0) return Infinity;

    // Annualize
    const annualizedReturn = avgReturn * 252;
    const annualizedDownsideDev = downsideDeviation * Math.sqrt(252);
    const annualizedExcessReturn = annualizedReturn - this.config.riskFreeRate;

    return annualizedExcessReturn / annualizedDownsideDev;
  }

  /**
   * Get the best and worst trades
   */
  async getBestAndWorstTrades(limit: number = 5): Promise<{
    best: TradeHistory[];
    worst: TradeHistory[];
  }> {
    const closedTrades = await this.tradeStorage.getClosedTrades();
    const sorted = [...closedTrades].sort((a, b) => b.netPnL - a.netPnL);

    return {
      best: sorted.slice(0, limit),
      worst: sorted.slice(-limit).reverse(),
    };
  }
}

// Factory function
export function createAnalyticsService(
  config: Partial<AnalyticsServiceConfig> = {}
): AnalyticsService {
  return new AnalyticsService(
    new InMemorySnapshotStorage(),
    new InMemoryTradeStorage(),
    config
  );
}
