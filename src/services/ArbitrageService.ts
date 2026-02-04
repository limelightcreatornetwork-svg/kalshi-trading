// Arbitrage Detection Service
// Scans Kalshi markets for pricing inefficiencies

import { v4 as uuid } from 'uuid';
import { getMarkets, createOrder, cancelOrder, Market } from '@/lib/kalshi';
import type {
  ArbitrageOpportunity,
  ArbitrageScanResult,
  MarketWithArbitrage,
  ArbitrageExecuteRequest,
  ArbitrageExecuteResult,
  ArbitrageType,
  ArbitrageStatus,
} from '@/types/arbitrage';
import prisma from '@/lib/prisma';

// Minimum profit in cents to consider an opportunity worth tracking
const MIN_PROFIT_CENTS = 0.5;

// In-memory fallback storage (used when database is not available)
const inMemoryStore = {
  opportunities: new Map<string, ArbitrageOpportunity>(),
  scans: [] as { marketsScanned: number; opportunitiesFound: number; totalProfitPotential: number; scanDurationMs: number; completedAt: Date }[],
};

export class ArbitrageService {
  /**
   * Check if database is available
   */
  private isDatabaseAvailable(): boolean {
    return prisma !== null;
  }

  /**
   * Scan all active markets for arbitrage opportunities
   * 
   * Single-market arbitrage occurs when:
   * - yesAsk + noAsk < 100 cents (buy both sides, guarantee profit)
   * 
   * This is the "free money" scenario where market makers haven't
   * properly priced the binary options.
   */
  async scanForOpportunities(): Promise<ArbitrageScanResult> {
    const startTime = Date.now();
    const scanId = uuid();
    
    const allMarkets: MarketWithArbitrage[] = [];
    const opportunities: ArbitrageOpportunity[] = [];
    
    let cursor: string | undefined;
    let totalMarketsScanned = 0;
    
    // Paginate through all active markets
    do {
      const response = await getMarkets({
        limit: 100,
        cursor,
        status: 'open',
      });
      
      for (const market of response.markets) {
        const analysis = this.analyzeMarket(market);
        allMarkets.push(analysis);
        totalMarketsScanned++;
        
        if (analysis.hasArbitrage && analysis.profitCents >= MIN_PROFIT_CENTS) {
          const opportunity = await this.createOrUpdateOpportunity(analysis, market);
          opportunities.push(opportunity);
        }
      }
      
      cursor = response.cursor || undefined;
    } while (cursor);
    
    // Mark opportunities that weren't seen in this scan as potentially expired
    await this.markStaleOpportunities(opportunities.map(o => o.id));
    
    const scanDurationMs = Date.now() - startTime;
    const totalProfitPotential = opportunities.reduce((sum, o) => sum + o.profitCents, 0);
    
    // Record the scan
    if (this.isDatabaseAvailable()) {
      await prisma!.arbitrageScan.create({
        data: {
          marketsScanned: totalMarketsScanned,
          opportunitiesFound: opportunities.length,
          totalProfitPotential,
          scanDurationMs,
          completedAt: new Date(),
        },
      });
    } else {
      // Fallback to in-memory
      inMemoryStore.scans.push({
        marketsScanned: totalMarketsScanned,
        opportunitiesFound: opportunities.length,
        totalProfitPotential,
        scanDurationMs,
        completedAt: new Date(),
      });
    }
    
    return {
      scanId,
      marketsScanned: totalMarketsScanned,
      opportunitiesFound: opportunities.length,
      totalProfitPotential,
      scanDurationMs,
      opportunities: opportunities.sort((a, b) => b.profitCents - a.profitCents),
      allMarkets: allMarkets.sort((a, b) => b.profitCents - a.profitCents),
    };
  }
  
  /**
   * Analyze a single market for arbitrage opportunity
   */
  analyzeMarket(market: Market): MarketWithArbitrage {
    // Kalshi prices are in cents (0-100)
    const yesBid = market.yes_bid || 0;
    const yesAsk = market.yes_ask || 0;
    const noBid = market.no_bid || 0;
    const noAsk = market.no_ask || 0;
    
    // Cost to buy both YES and NO at ask prices
    // If < 100, we can buy both for less than guaranteed payout
    const buyBothCost = yesAsk + noAsk;
    
    // Revenue if we sell both YES and NO at bid prices
    const sellBothRevenue = yesBid + noBid;
    
    // Profit = Guaranteed payout (100) - Cost to buy both
    const profitCents = 100 - buyBothCost;
    
    // ROI = Profit / Cost
    const profitPercent = buyBothCost > 0 ? (profitCents / buyBothCost) * 100 : 0;
    
    // Arbitrage exists if we can buy both for < $1.00
    // We also need both asks to be available (not 0)
    const hasArbitrage = buyBothCost < 100 && yesAsk > 0 && noAsk > 0 && profitCents >= MIN_PROFIT_CENTS;
    
    return {
      ticker: market.ticker,
      eventTicker: market.event_ticker,
      title: market.title,
      status: market.status,
      yesBid,
      yesAsk,
      noBid,
      noAsk,
      buyBothCost,
      sellBothRevenue,
      hasArbitrage,
      profitCents: hasArbitrage ? profitCents : 0,
      profitPercent: hasArbitrage ? profitPercent : 0,
      volume24h: market.volume_24h || 0,
      openInterest: market.open_interest || 0,
    };
  }
  
  /**
   * Create or update an arbitrage opportunity in the database
   */
  private async createOrUpdateOpportunity(
    analysis: MarketWithArbitrage,
    market: Market
  ): Promise<ArbitrageOpportunity> {
    const now = new Date();
    
    if (this.isDatabaseAvailable()) {
      // Check if we already have an active opportunity for this market
      const existing = await prisma!.arbitrageOpportunity.findFirst({
        where: {
          marketTicker: market.ticker,
          status: 'ACTIVE',
        },
      });
      
      if (existing) {
        // Update the existing opportunity
        const updated = await prisma!.arbitrageOpportunity.update({
          where: { id: existing.id },
          data: {
            yesBid: analysis.yesBid,
            yesAsk: analysis.yesAsk,
            noBid: analysis.noBid,
            noAsk: analysis.noAsk,
            totalCost: analysis.buyBothCost,
            profitCents: analysis.profitCents,
            profitPercent: analysis.profitPercent,
            lastSeenAt: new Date(),
          },
        });
        
        return this.mapDbToOpportunity(updated);
      }
      
      // Create new opportunity
      const created = await prisma!.arbitrageOpportunity.create({
        data: {
          type: 'SINGLE_MARKET',
          status: 'ACTIVE',
          marketTicker: market.ticker,
          marketTitle: market.title,
          yesBid: analysis.yesBid,
          yesAsk: analysis.yesAsk,
          noBid: analysis.noBid,
          noAsk: analysis.noAsk,
          totalCost: analysis.buyBothCost,
          guaranteedPayout: 100,
          profitCents: analysis.profitCents,
          profitPercent: analysis.profitPercent,
        },
      });
      
      return this.mapDbToOpportunity(created);
    }
    
    // Fallback to in-memory
    const existingKey = Array.from(inMemoryStore.opportunities.entries())
      .find(([, o]) => o.marketTicker === market.ticker && o.status === 'ACTIVE')?.[0];
    
    if (existingKey) {
      const existing = inMemoryStore.opportunities.get(existingKey)!;
      const updated: ArbitrageOpportunity = {
        ...existing,
        yesBid: analysis.yesBid,
        yesAsk: analysis.yesAsk,
        noBid: analysis.noBid,
        noAsk: analysis.noAsk,
        totalCost: analysis.buyBothCost,
        profitCents: analysis.profitCents,
        profitPercent: analysis.profitPercent,
        lastSeenAt: now.toISOString(),
      };
      inMemoryStore.opportunities.set(existingKey, updated);
      return updated;
    }
    
    // Create new in-memory opportunity
    const newOpportunity: ArbitrageOpportunity = {
      id: uuid(),
      type: 'SINGLE_MARKET',
      status: 'ACTIVE',
      marketTicker: market.ticker,
      marketTitle: market.title,
      yesBid: analysis.yesBid,
      yesAsk: analysis.yesAsk,
      noBid: analysis.noBid,
      noAsk: analysis.noAsk,
      totalCost: analysis.buyBothCost,
      guaranteedPayout: 100,
      profitCents: analysis.profitCents,
      profitPercent: analysis.profitPercent,
      alertSent: false,
      detectedAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    };
    inMemoryStore.opportunities.set(newOpportunity.id, newOpportunity);
    return newOpportunity;
  }
  
  /**
   * Mark opportunities not seen in recent scan as potentially expired
   */
  private async markStaleOpportunities(activeIds: string[]): Promise<void> {
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
    
    if (this.isDatabaseAvailable()) {
      await prisma!.arbitrageOpportunity.updateMany({
        where: {
          status: 'ACTIVE',
          lastSeenAt: { lt: staleThreshold },
          id: { notIn: activeIds },
        },
        data: {
          status: 'EXPIRED',
          expiredAt: new Date(),
        },
      });
    } else {
      // Fallback to in-memory
      for (const [id, opp] of inMemoryStore.opportunities) {
        if (opp.status === 'ACTIVE' && 
            !activeIds.includes(id) && 
            new Date(opp.lastSeenAt) < staleThreshold) {
          inMemoryStore.opportunities.set(id, {
            ...opp,
            status: 'EXPIRED',
            expiredAt: new Date().toISOString(),
          });
        }
      }
    }
  }
  
  /**
   * Get all active opportunities
   */
  async getActiveOpportunities(): Promise<ArbitrageOpportunity[]> {
    if (this.isDatabaseAvailable()) {
      const opportunities = await prisma!.arbitrageOpportunity.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { profitCents: 'desc' },
      });
      
      return opportunities.map(this.mapDbToOpportunity);
    }
    
    // Fallback to in-memory
    return Array.from(inMemoryStore.opportunities.values())
      .filter(o => o.status === 'ACTIVE')
      .sort((a, b) => b.profitCents - a.profitCents);
  }
  
  /**
   * Get opportunity history
   */
  async getOpportunityHistory(params?: {
    limit?: number;
    type?: string;
    status?: string;
    minProfitCents?: number;
  }): Promise<ArbitrageOpportunity[]> {
    if (this.isDatabaseAvailable()) {
      const opportunities = await prisma!.arbitrageOpportunity.findMany({
        where: {
          ...(params?.type && { type: params.type as ArbitrageType }),
          ...(params?.status && { status: params.status as ArbitrageStatus }),
          ...(params?.minProfitCents && { profitCents: { gte: params.minProfitCents } }),
        },
        orderBy: { detectedAt: 'desc' },
        take: params?.limit || 100,
      });
      
      return opportunities.map(this.mapDbToOpportunity);
    }
    
    // Fallback to in-memory
    let opportunities = Array.from(inMemoryStore.opportunities.values());
    
    if (params?.type) {
      opportunities = opportunities.filter(o => o.type === params.type);
    }
    if (params?.status) {
      opportunities = opportunities.filter(o => o.status === params.status);
    }
    if (params?.minProfitCents) {
      opportunities = opportunities.filter(o => o.profitCents >= params.minProfitCents!);
    }
    
    return opportunities
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .slice(0, params?.limit || 100);
  }
  
  /**
   * Execute an arbitrage opportunity by buying both YES and NO
   */
  async executeOpportunity(request: ArbitrageExecuteRequest): Promise<ArbitrageExecuteResult> {
    let opportunity: ArbitrageOpportunity | null = null;
    
    if (this.isDatabaseAvailable()) {
      const dbOpp = await prisma!.arbitrageOpportunity.findUnique({
        where: { id: request.opportunityId },
      });
      if (dbOpp) {
        opportunity = this.mapDbToOpportunity(dbOpp);
      }
    } else {
      opportunity = inMemoryStore.opportunities.get(request.opportunityId) || null;
    }
    
    if (!opportunity) {
      return { success: false, opportunityId: request.opportunityId, error: 'Opportunity not found' };
    }
    
    if (opportunity.status !== 'ACTIVE') {
      return { success: false, opportunityId: request.opportunityId, error: `Opportunity is ${opportunity.status}` };
    }
    
    try {
      // Place YES order
      const yesOrder = await createOrder({
        ticker: opportunity.marketTicker,
        side: 'yes',
        action: 'buy',
        count: request.contracts,
        type: 'limit',
        yes_price: Number(opportunity.yesAsk),
      });

      // Place NO order - if this fails, cancel the YES order to avoid unhedged position
      let noOrder;
      try {
        noOrder = await createOrder({
          ticker: opportunity.marketTicker,
          side: 'no',
          action: 'buy',
          count: request.contracts,
          type: 'limit',
          no_price: Number(opportunity.noAsk),
        });
      } catch (noOrderError) {
        // Critical: YES order succeeded but NO order failed - cancel YES to avoid unhedged position
        try {
          await cancelOrder(yesOrder.order.order_id);
        } catch (_cancelError) {
          // If cancel also fails, we have an unhedged position - rethrow with context
          const msg = `CRITICAL: NO order failed and YES order ${yesOrder.order.order_id} cancel also failed. Manual intervention required.`;
          throw new Error(msg);
        }
        throw noOrderError;
      }

      const totalCost = (Number(opportunity.yesAsk) + Number(opportunity.noAsk)) * request.contracts;
      const expectedProfit = Number(opportunity.profitCents) * request.contracts;
      
      // Update opportunity as executed
      if (this.isDatabaseAvailable()) {
        await prisma!.arbitrageOpportunity.update({
          where: { id: request.opportunityId },
          data: {
            status: 'EXECUTED',
            executedAt: new Date(),
            executedContracts: request.contracts,
            actualProfit: expectedProfit,
          },
        });
      } else {
        const updated = {
          ...opportunity,
          status: 'EXECUTED' as const,
          executedAt: new Date().toISOString(),
          executedContracts: request.contracts,
          actualProfit: expectedProfit,
        };
        inMemoryStore.opportunities.set(request.opportunityId, updated);
      }
      
      return {
        success: true,
        opportunityId: request.opportunityId,
        yesOrderId: yesOrder.order.order_id,
        noOrderId: noOrder.order.order_id,
        yesPrice: Number(opportunity.yesAsk),
        noPrice: Number(opportunity.noAsk),
        totalCost,
        expectedProfit,
      };
    } catch (error) {
      // Mark as missed if we couldn't execute
      if (this.isDatabaseAvailable()) {
        await prisma!.arbitrageOpportunity.update({
          where: { id: request.opportunityId },
          data: { status: 'MISSED' },
        });
      } else {
        const existing = inMemoryStore.opportunities.get(request.opportunityId);
        if (existing) {
          inMemoryStore.opportunities.set(request.opportunityId, { ...existing, status: 'MISSED' });
        }
      }
      
      return {
        success: false,
        opportunityId: request.opportunityId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Get scan statistics
   */
  async getScanStats(): Promise<{
    totalScans: number;
    totalOpportunities: number;
    avgProfitCents: number;
    totalProfitPotential: number;
    executedCount: number;
    totalActualProfit: number;
  }> {
    if (this.isDatabaseAvailable()) {
      const [scans, opportunities, executed] = await Promise.all([
        prisma!.arbitrageScan.aggregate({
          _count: true,
          _sum: { opportunitiesFound: true, totalProfitPotential: true },
        }),
        prisma!.arbitrageOpportunity.aggregate({
          _count: true,
          _avg: { profitCents: true },
          _sum: { profitCents: true },
        }),
        prisma!.arbitrageOpportunity.aggregate({
          where: { status: 'EXECUTED' },
          _count: true,
          _sum: { actualProfit: true },
        }),
      ]);
      
      return {
        totalScans: scans._count,
        totalOpportunities: opportunities._count,
        avgProfitCents: Number(opportunities._avg?.profitCents || 0),
        totalProfitPotential: Number(opportunities._sum?.profitCents || 0),
        executedCount: executed._count,
        totalActualProfit: Number(executed._sum?.actualProfit || 0),
      };
    }
    
    // Fallback to in-memory
    const opportunities = Array.from(inMemoryStore.opportunities.values());
    const executed = opportunities.filter(o => o.status === 'EXECUTED');
    const totalProfit = opportunities.reduce((sum, o) => sum + o.profitCents, 0);
    
    return {
      totalScans: inMemoryStore.scans.length,
      totalOpportunities: opportunities.length,
      avgProfitCents: opportunities.length > 0 ? totalProfit / opportunities.length : 0,
      totalProfitPotential: totalProfit,
      executedCount: executed.length,
      totalActualProfit: executed.reduce((sum, o) => sum + (o.actualProfit || 0), 0),
    };
  }
  
  /**
   * Check if alerts should be sent for high-value opportunities
   */
  async checkAlerts(): Promise<ArbitrageOpportunity[]> {
    if (!this.isDatabaseAvailable()) {
      return []; // Alerts not supported without database
    }
    
    const config = await prisma!.arbitrageAlertConfig.findFirst({
      where: { isActive: true },
    });
    
    if (!config || !config.alertEnabled) {
      return [];
    }
    
    const opportunities = await prisma!.arbitrageOpportunity.findMany({
      where: {
        status: 'ACTIVE',
        alertSent: false,
        profitCents: { gte: Number(config.minProfitCents) },
        profitPercent: { gte: Number(config.minProfitPercent) },
      },
    });
    
    // Mark alerts as sent
    if (opportunities.length > 0) {
      await prisma!.arbitrageOpportunity.updateMany({
        where: { id: { in: opportunities.map(o => o.id) } },
        data: { alertSent: true, alertSentAt: new Date() },
      });
    }
    
    return opportunities.map(this.mapDbToOpportunity);
  }
  
  /**
   * Map database model to API type
   */
  private mapDbToOpportunity(db: Record<string, unknown>): ArbitrageOpportunity {
    return {
      id: db.id as string,
      type: db.type as ArbitrageType,
      status: db.status as ArbitrageStatus,
      marketTicker: db.marketTicker as string,
      marketTitle: db.marketTitle as string,
      relatedMarketTicker: (db.relatedMarketTicker as string | null) || undefined,
      relatedMarketTitle: (db.relatedMarketTitle as string | null) || undefined,
      yesBid: Number(db.yesBid),
      yesAsk: Number(db.yesAsk),
      noBid: Number(db.noBid),
      noAsk: Number(db.noAsk),
      totalCost: Number(db.totalCost),
      guaranteedPayout: Number(db.guaranteedPayout),
      profitCents: Number(db.profitCents),
      profitPercent: Number(db.profitPercent),
      maxContracts: db.maxContracts != null ? Number(db.maxContracts) : undefined,
      estimatedMaxProfit: db.estimatedMaxProfit != null ? Number(db.estimatedMaxProfit) : undefined,
      executedAt: db.executedAt ? (db.executedAt as Date).toISOString() : undefined,
      executedContracts: db.executedContracts != null ? Number(db.executedContracts) : undefined,
      actualProfit: db.actualProfit != null ? Number(db.actualProfit) : undefined,
      alertSent: (db.alertSent as boolean) ?? false,
      alertSentAt: db.alertSentAt ? (db.alertSentAt as Date).toISOString() : undefined,
      detectedAt: (db.detectedAt as Date).toISOString(),
      lastSeenAt: (db.lastSeenAt as Date).toISOString(),
      expiredAt: db.expiredAt ? (db.expiredAt as Date).toISOString() : undefined,
    };
  }
}

// Export singleton instance
export const arbitrageService = new ArbitrageService();
