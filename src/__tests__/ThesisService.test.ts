// Thesis Service Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ThesisService,
  ThesisServiceEvents,
} from '../services/ThesisService';
import { InMemoryThesisStorage, createThesisService } from './helpers/test-factories';
import { ThesisStatus } from '../types/thesis';

describe('InMemoryThesisStorage', () => {
  let storage: InMemoryThesisStorage;

  beforeEach(() => {
    storage = new InMemoryThesisStorage();
  });

  it('should create and retrieve theses', async () => {
    const thesis = {
      id: 'thesis-1',
      marketId: 'market-1',
      marketTicker: 'BTCUSD-Y',
      hypothesis: 'BTC will rise',
      direction: 'yes' as const,
      confidence: 0.7,
      modelId: 'value-model',
      modelVersion: '1.0.0',
      evidenceLinks: ['https://example.com'],
      falsificationCriteria: 'Drop below $50k',
      targetPrice: 60,
      edgeRequired: 2,
      maxPrice: 95,
      status: ThesisStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await storage.create(thesis);
    const retrieved = await storage.getById('thesis-1');

    expect(retrieved).toEqual(thesis);
  });

  it('should filter active theses', async () => {
    await storage.create({
      id: 'thesis-active',
      marketId: 'market-1',
      marketTicker: 'BTCUSD-Y',
      hypothesis: 'Active thesis',
      direction: 'yes',
      confidence: 0.7,
      modelId: 'model-1',
      modelVersion: '1.0.0',
      evidenceLinks: [],
      falsificationCriteria: 'test',
      targetPrice: 60,
      edgeRequired: 2,
      maxPrice: 95,
      status: ThesisStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await storage.create({
      id: 'thesis-expired',
      marketId: 'market-2',
      marketTicker: 'ETHUSD-Y',
      hypothesis: 'Expired thesis',
      direction: 'no',
      confidence: 0.6,
      modelId: 'model-1',
      modelVersion: '1.0.0',
      evidenceLinks: [],
      falsificationCriteria: 'test',
      targetPrice: 40,
      edgeRequired: 2,
      maxPrice: 95,
      status: ThesisStatus.EXPIRED,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const active = await storage.getActive();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('thesis-active');
  });

  it('should exclude expired theses by date', async () => {
    await storage.create({
      id: 'thesis-past-expiry',
      marketId: 'market-1',
      marketTicker: 'TEST-Y',
      hypothesis: 'Past expiry',
      direction: 'yes',
      confidence: 0.7,
      modelId: 'model-1',
      modelVersion: '1.0.0',
      evidenceLinks: [],
      falsificationCriteria: 'test',
      targetPrice: 60,
      edgeRequired: 2,
      maxPrice: 95,
      status: ThesisStatus.ACTIVE,
      expiresAt: new Date(Date.now() - 1000), // Already past
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const active = await storage.getActive();
    expect(active).toHaveLength(0);
  });
});

describe('ThesisService', () => {
  let service: ThesisService;
  let storage: InMemoryThesisStorage;
  let events: ThesisServiceEvents;

  beforeEach(() => {
    storage = new InMemoryThesisStorage();
    events = {
      onThesisCreated: vi.fn(),
      onThesisInvalidated: vi.fn(),
      onTradeSignal: vi.fn(),
    };
    service = new ThesisService(storage, events);
  });

  describe('createThesis', () => {
    it('should create a new thesis', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'BTCUSD-Y',
        hypothesis: 'BTC will pump',
        direction: 'yes',
        confidence: 0.75,
        modelId: 'value-model',
        modelVersion: '1.0.0',
        falsificationCriteria: 'Price drops below $40k',
        targetPrice: 65,
      });

      expect(thesis.id).toBeDefined();
      expect(thesis.hypothesis).toBe('BTC will pump');
      expect(thesis.confidence).toBe(0.75);
      expect(thesis.edgeRequired).toBe(2); // Default
      expect(thesis.status).toBe(ThesisStatus.ACTIVE);
      expect(events.onThesisCreated).toHaveBeenCalled();
    });

    it('should supersede existing active thesis for same market', async () => {
      const thesis1 = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'BTCUSD-Y',
        hypothesis: 'First thesis',
        direction: 'yes',
        confidence: 0.6,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 55,
      });

      const thesis2 = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'BTCUSD-Y',
        hypothesis: 'Second thesis',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 60,
      });

      // First thesis should be superseded
      const updated1 = await service.getThesis(thesis1.id);
      expect(updated1?.status).toBe(ThesisStatus.SUPERSEDED);

      // Second should be active
      expect(thesis2.status).toBe(ThesisStatus.ACTIVE);
    });
  });

  describe('invalidateThesis', () => {
    it('should invalidate a thesis', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.6,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'Price drops',
        targetPrice: 50,
      });

      const invalidated = await service.invalidateThesis({
        thesisId: thesis.id,
        reason: 'Price dropped below threshold',
      });

      expect(invalidated?.status).toBe(ThesisStatus.INVALIDATED);
      expect(invalidated?.invalidationReason).toBe('Price dropped below threshold');
      expect(invalidated?.invalidatedAt).toBeDefined();
      expect(events.onThesisInvalidated).toHaveBeenCalled();
    });
  });

  describe('evaluateThesis', () => {
    it('should generate trade signal when edge is sufficient', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 60,
        edgeRequired: 2,
      });

      // Market price is 55, our target is 60, so 5 cent edge
      const evaluation = await service.evaluateThesis(thesis.id, 55, 45);

      expect(evaluation?.shouldTrade).toBe(true);
      expect(evaluation?.edge).toBe(5); // 60 - 55
      expect(evaluation?.recommendedAction).toBe('buy_yes');
      expect(events.onTradeSignal).toHaveBeenCalled();
    });

    it('should not signal when edge is insufficient', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 60,
        edgeRequired: 5,
      });

      // Market price is 58, our target is 60, so only 2 cent edge
      const evaluation = await service.evaluateThesis(thesis.id, 58, 42);

      expect(evaluation?.shouldTrade).toBe(false);
      expect(evaluation?.edge).toBe(2);
      expect(evaluation?.reason).toContain('Edge');
    });

    it('should not signal when price exceeds max', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 98,
        edgeRequired: 2,
        maxPrice: 90,
      });

      // Market price 96 exceeds max 90
      const evaluation = await service.evaluateThesis(thesis.id, 96, 4);

      expect(evaluation?.shouldTrade).toBe(false);
      expect(evaluation?.reason).toContain('max');
    });

    it('should not signal for inactive thesis', async () => {
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'model-1',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 60,
      });

      await service.invalidateThesis({
        thesisId: thesis.id,
        reason: 'Test invalidation',
      });

      const evaluation = await service.evaluateThesis(thesis.id, 50, 50);

      expect(evaluation?.shouldTrade).toBe(false);
      expect(evaluation?.reason).toContain('INVALIDATED');
    });
  });

  describe('captureSnapshot', () => {
    it('should create a data snapshot', async () => {
      const snapshot = await service.captureSnapshot(
        'market-1',
        'TEST-Y',
        {
          yesBid: 48,
          yesAsk: 52,
          noBid: 47,
          noAsk: 53,
          lastPrice: 50,
          volume24h: 10000,
          openInterest: 5000,
        }
      );

      expect(snapshot.id).toBeDefined();
      expect(snapshot.spread).toBe(4); // 52 - 48
      expect(snapshot.capturedAt).toBeDefined();
    });
  });

  describe('getModelCalibration', () => {
    it('should calculate calibration metrics', async () => {
      // Record some performance data
      const thesis = await service.createThesis({
        marketId: 'market-1',
        marketTicker: 'TEST-Y',
        hypothesis: 'Test',
        direction: 'yes',
        confidence: 0.7,
        modelId: 'test-model',
        modelVersion: '1.0.0',
        falsificationCriteria: 'test',
        targetPrice: 60,
      });

      await service.recordPerformance(thesis.id, true, 100);

      const calibration = await service.getModelCalibration('test-model');

      expect(calibration.modelId).toBe('test-model');
      expect(calibration.totalPredictions).toBe(1);
    });
  });
});

describe('createThesisService', () => {
  it('should create service with default storage', () => {
    const service = createThesisService();
    expect(service).toBeInstanceOf(ThesisService);
  });
});
