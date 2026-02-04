// Thesis Service
// Every trade must have a traceable thesis with evidence

import {
  Thesis,
  ThesisStatus,
  DataSnapshot,
  CreateThesisRequest,
  UpdateThesisRequest,
  InvalidateThesisRequest,
  ThesisEvaluation,
  ThesisPerformance,
} from '../types/thesis';

export interface ThesisStorage {
  getById(id: string): Promise<Thesis | null>;
  getByMarket(marketId: string): Promise<Thesis[]>;
  getActive(): Promise<Thesis[]>;
  getActiveForMarket(marketId: string): Promise<Thesis | null>;
  create(thesis: Thesis): Promise<void>;
  update(id: string, updates: Partial<Thesis>): Promise<void>;
  
  // Snapshots
  createSnapshot(snapshot: DataSnapshot): Promise<void>;
  getSnapshot(id: string): Promise<DataSnapshot | null>;
  
  // Performance tracking
  recordPerformance(perf: ThesisPerformance): Promise<void>;
  getPerformanceByModel(modelId: string): Promise<ThesisPerformance[]>;
}

export interface ThesisServiceEvents {
  onThesisCreated?: (thesis: Thesis) => void;
  onThesisInvalidated?: (thesis: Thesis, reason: string) => void;
  onTradeSignal?: (evaluation: ThesisEvaluation) => void;
}

export class ThesisService {
  private storage: ThesisStorage;
  private events: ThesisServiceEvents;

  constructor(storage: ThesisStorage, events: ThesisServiceEvents = {}) {
    this.storage = storage;
    this.events = events;
  }

  /**
   * Create a new thesis for a market
   */
  async createThesis(request: CreateThesisRequest): Promise<Thesis> {
    // Check for existing active thesis on this market
    const existing = await this.storage.getActiveForMarket(request.marketId);
    if (existing) {
      // Supersede the old thesis
      await this.storage.update(existing.id, {
        status: ThesisStatus.SUPERSEDED,
        updatedAt: new Date(),
      });
    }

    const thesis: Thesis = {
      id: crypto.randomUUID(),
      marketId: request.marketId,
      marketTicker: request.marketTicker,
      hypothesis: request.hypothesis,
      direction: request.direction,
      confidence: request.confidence,
      modelId: request.modelId,
      modelVersion: request.modelVersion,
      evidenceLinks: request.evidenceLinks ?? [],
      evidenceSummary: request.evidenceSummary,
      falsificationCriteria: request.falsificationCriteria,
      targetPrice: request.targetPrice,
      edgeRequired: request.edgeRequired ?? 2, // Default 2 cents
      maxPrice: request.maxPrice ?? (request.direction === 'yes' ? 95 : 95),
      status: ThesisStatus.ACTIVE,
      expiresAt: request.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.create(thesis);

    if (this.events.onThesisCreated) {
      this.events.onThesisCreated(thesis);
    }

    return thesis;
  }

  /**
   * Update an existing thesis
   */
  async updateThesis(id: string, request: UpdateThesisRequest): Promise<Thesis | null> {
    const thesis = await this.storage.getById(id);
    if (!thesis) return null;

    const updates: Partial<Thesis> = {
      ...request,
      updatedAt: new Date(),
    };

    await this.storage.update(id, updates);
    return this.storage.getById(id);
  }

  /**
   * Invalidate a thesis (falsification triggered)
   */
  async invalidateThesis(request: InvalidateThesisRequest): Promise<Thesis | null> {
    const thesis = await this.storage.getById(request.thesisId);
    if (!thesis) return null;

    await this.storage.update(request.thesisId, {
      status: ThesisStatus.INVALIDATED,
      invalidatedAt: new Date(),
      invalidationReason: request.reason,
    });

    const updated = await this.storage.getById(request.thesisId);
    
    if (updated && this.events.onThesisInvalidated) {
      this.events.onThesisInvalidated(updated, request.reason);
    }

    return updated;
  }

  /**
   * Mark thesis as executed (trade placed)
   */
  async markExecuted(thesisId: string): Promise<void> {
    await this.storage.update(thesisId, {
      status: ThesisStatus.EXECUTED,
    });
  }

  /**
   * Capture a data snapshot for a market
   */
  async captureSnapshot(
    marketId: string,
    marketTicker: string,
    marketData: {
      yesBid: number;
      yesAsk: number;
      noBid: number;
      noAsk: number;
      lastPrice: number;
      volume24h: number;
      openInterest: number;
    }
  ): Promise<DataSnapshot> {
    const snapshot: DataSnapshot = {
      id: crypto.randomUUID(),
      marketId,
      marketTicker,
      yesBid: marketData.yesBid,
      yesAsk: marketData.yesAsk,
      noBid: marketData.noBid,
      noAsk: marketData.noAsk,
      lastPrice: marketData.lastPrice,
      bidDepth: 0, // TODO: Get from orderbook
      askDepth: 0,
      spread: marketData.yesAsk - marketData.yesBid,
      volume24h: marketData.volume24h,
      openInterest: marketData.openInterest,
      capturedAt: new Date(),
    };

    await this.storage.createSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Link a snapshot to a thesis
   */
  async linkSnapshot(thesisId: string, snapshotId: string): Promise<void> {
    await this.storage.update(thesisId, { dataSnapshotId: snapshotId });
  }

  /**
   * Evaluate a thesis against current market conditions
   */
  async evaluateThesis(
    thesisId: string,
    currentYesPrice: number,
    currentNoPrice: number
  ): Promise<ThesisEvaluation | null> {
    const thesis = await this.storage.getById(thesisId);
    if (!thesis) return null;

    // For YES thesis: we want to buy YES when price < our target
    // For NO thesis: we want to buy NO when price < our target
    const currentPrice = thesis.direction === 'yes' ? currentYesPrice : currentNoPrice;
    const thesisPrice = thesis.targetPrice;
    
    // Edge = difference between market price and our fair value
    // Positive edge = market is cheap, we should buy
    const edge = thesisPrice - currentPrice;
    const edgePercent = (edge / thesisPrice) * 100;
    
    // Should we trade?
    const hasPositiveEdge = edge >= thesis.edgeRequired;
    const underMaxPrice = currentPrice <= thesis.maxPrice;
    const isStillActive = thesis.status === ThesisStatus.ACTIVE;
    const notExpired = !thesis.expiresAt || thesis.expiresAt > new Date();
    
    const shouldTrade = hasPositiveEdge && underMaxPrice && isStillActive && notExpired;

    let reason: string;
    if (!isStillActive) {
      reason = `Thesis status is ${thesis.status}`;
    } else if (!notExpired) {
      reason = 'Thesis has expired';
    } else if (!hasPositiveEdge) {
      reason = `Edge ${edge.toFixed(2)}¢ < required ${thesis.edgeRequired}¢`;
    } else if (!underMaxPrice) {
      reason = `Price ${currentPrice}¢ > max ${thesis.maxPrice}¢`;
    } else {
      reason = `Trade signal: ${edge.toFixed(2)}¢ edge (${edgePercent.toFixed(1)}%)`;
    }

    const evaluation: ThesisEvaluation = {
      thesisId,
      marketId: thesis.marketId,
      currentPrice,
      thesisPrice,
      edge,
      edgePercent,
      shouldTrade,
      reason,
      recommendedAction: shouldTrade 
        ? (thesis.direction === 'yes' ? 'buy_yes' : 'buy_no')
        : undefined,
      recommendedPrice: shouldTrade ? currentPrice : undefined,
    };

    if (shouldTrade && this.events.onTradeSignal) {
      this.events.onTradeSignal(evaluation);
    }

    return evaluation;
  }

  /**
   * Check all active theses and expire those past their date
   */
  async expireOldTheses(): Promise<number> {
    const active = await this.storage.getActive();
    const now = new Date();
    let expired = 0;

    for (const thesis of active) {
      if (thesis.expiresAt && thesis.expiresAt < now) {
        await this.storage.update(thesis.id, {
          status: ThesisStatus.EXPIRED,
        });
        expired++;
      }
    }

    return expired;
  }

  /**
   * Get all active theses
   */
  async getActiveTheses(): Promise<Thesis[]> {
    return this.storage.getActive();
  }

  /**
   * Get thesis by ID
   */
  async getThesis(id: string): Promise<Thesis | null> {
    return this.storage.getById(id);
  }

  /**
   * Get all theses for a market (including historical)
   */
  async getThesesForMarket(marketId: string): Promise<Thesis[]> {
    return this.storage.getByMarket(marketId);
  }

  /**
   * Record thesis performance after market settlement
   */
  async recordPerformance(
    thesisId: string,
    actualOutcome: boolean,
    exitPrice: number
  ): Promise<ThesisPerformance | null> {
    const thesis = await this.storage.getById(thesisId);
    if (!thesis) return null;

    // Brier score: (predicted - actual)^2
    // predicted = confidence for YES, (1 - confidence) for NO
    const predictedYes = thesis.direction === 'yes' 
      ? thesis.confidence 
      : (1 - thesis.confidence);
    const actualYes = actualOutcome ? 1 : 0;
    const brierScore = Math.pow(predictedYes - actualYes, 0.5);

    const perf: ThesisPerformance = {
      thesisId,
      marketId: thesis.marketId,
      predictedProbability: thesis.confidence,
      actualOutcome,
      brierScore,
      totalContracts: 0, // TODO: sum from orders
      avgEntryPrice: thesis.targetPrice,
      exitPrice,
      realizedPnl: 0, // TODO: calculate from orders
      modelId: thesis.modelId,
      evaluatedAt: new Date(),
    };

    await this.storage.recordPerformance(perf);
    return perf;
  }

  /**
   * Get Brier score statistics by model
   */
  async getModelCalibration(modelId: string): Promise<{
    modelId: string;
    totalPredictions: number;
    avgBrierScore: number;
    accuracy: number;
  }> {
    const perfs = await this.storage.getPerformanceByModel(modelId);
    
    if (perfs.length === 0) {
      return {
        modelId,
        totalPredictions: 0,
        avgBrierScore: 0,
        accuracy: 0,
      };
    }

    const withOutcome = perfs.filter(p => p.actualOutcome !== undefined);
    const brierScores = withOutcome
      .filter(p => p.brierScore !== undefined)
      .map(p => p.brierScore!);
    
    const avgBrier = brierScores.length > 0
      ? brierScores.reduce((a, b) => a + b, 0) / brierScores.length
      : 0;

    // Simple accuracy: did we predict the right direction?
    const correct = withOutcome.filter(p => {
      const predictedYes = p.predictedProbability > 0.5;
      return predictedYes === p.actualOutcome;
    }).length;

    return {
      modelId,
      totalPredictions: withOutcome.length,
      avgBrierScore: avgBrier,
      accuracy: withOutcome.length > 0 ? correct / withOutcome.length : 0,
    };
  }
}

