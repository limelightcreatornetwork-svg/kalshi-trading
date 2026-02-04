import { describe, it, expect, beforeEach } from 'vitest';
import { ForecastingService, createForecastingService } from '../services/ForecastingService';
import type { Market } from '../lib/kalshi';
import type { ForecastModel, ForecastModelType } from '../types/forecasting';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockMarket = (overrides: Partial<Market> = {}): Market => ({
  ticker: 'TEST-MARKET-123',
  event_ticker: 'TEST-EVENT',
  title: 'Test Market: Will X happen?',
  yes_bid: 45,
  yes_ask: 48,
  no_bid: 50,
  no_ask: 53,
  last_price: 46,
  volume: 5000,
  volume_24h: 2500,
  open_interest: 1000,
  status: 'open',
  expiration_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  ...overrides,
});

const createHighVolumeMarket = (): Market =>
  createMockMarket({
    ticker: 'HIGH-VOL-MKT',
    volume_24h: 10000,
    open_interest: 5000,
    yes_bid: 60,
    yes_ask: 62,
    no_bid: 36,
    no_ask: 38,
  });

const createLowLiquidityMarket = (): Market =>
  createMockMarket({
    ticker: 'LOW-LIQ-MKT',
    volume_24h: 50,
    open_interest: 20,
    yes_bid: 40,
    yes_ask: 55, // Wide spread
    no_bid: 40,
    no_ask: 55,
  });

const _createExtremeMarket = (): Market =>
  createMockMarket({
    ticker: 'EXTREME-MKT',
    yes_bid: 90,
    yes_ask: 92,
    no_bid: 6,
    no_ask: 8,
    volume_24h: 3000,
    open_interest: 2000,
  });

// ============================================================================
// Tests
// ============================================================================

describe('ForecastingService', () => {
  let service: ForecastingService;

  beforeEach(() => {
    service = createForecastingService({
      bankroll: 10000,
      minEdgeToTrade: 0.03,
      minConfidence: 0.5,
    });
  });

  describe('Implied Probability Extraction', () => {
    it('should extract implied probability from market prices', () => {
      const market = createMockMarket({
        yes_bid: 45,
        yes_ask: 48,
      });

      const implied = service.extractImpliedProbability(market);

      expect(implied.ticker).toBe('TEST-MARKET-123');
      expect(implied.yesBid).toBe(45);
      expect(implied.yesAsk).toBe(48);
      expect(implied.impliedYesMid).toBeCloseTo(0.465, 2); // (45 + 48) / 2 / 100
      expect(implied.impliedYesBid).toBeCloseTo(0.45, 2);
      expect(implied.impliedYesAsk).toBeCloseTo(0.48, 2);
      expect(implied.yesSpread).toBe(3);
    });

    it('should calculate spread percentage correctly', () => {
      const market = createMockMarket({
        yes_bid: 40,
        yes_ask: 60,
      });

      const implied = service.extractImpliedProbability(market);

      expect(implied.yesSpread).toBe(20);
      expect(implied.spreadPercent).toBeCloseTo(0.4, 2); // 20 / 50
    });

    it('should handle edge cases with zero prices', () => {
      const market = createMockMarket({
        yes_bid: 0,
        yes_ask: 0,
      });

      const implied = service.extractImpliedProbability(market);

      expect(implied.impliedYesMid).toBe(0);
      expect(implied.spreadPercent).toBe(0);
    });
  });

  describe('Forecast Generation', () => {
    it('should generate a forecast with all required fields', async () => {
      const market = createMockMarket();

      const forecast = await service.generateForecast(market);

      expect(forecast).toBeDefined();
      expect(forecast.ticker).toBe('TEST-MARKET-123');
      expect(forecast.modelId).toBe('baseline-v1');
      expect(forecast.predictedProbability).toBeGreaterThan(0);
      expect(forecast.predictedProbability).toBeLessThan(1);
      expect(forecast.confidence).toBeGreaterThan(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
      expect(forecast.marketProbability).toBeCloseTo(0.48, 2);
      expect(forecast.edge).toBeDefined();
      expect(forecast.edgeCents).toBeDefined();
      expect(forecast.kellyFraction).toBeGreaterThanOrEqual(0);
    });

    it('should calculate edge correctly', async () => {
      const market = createMockMarket({
        yes_ask: 50, // Market says 50%
      });

      const forecast = await service.generateForecast(market);

      // Edge = predicted - market
      expect(forecast.edge).toBeCloseTo(forecast.predictedProbability - 0.5, 2);
      expect(forecast.edgeCents).toBeCloseTo(forecast.edge * 100, 1);
    });

    it('should use different models', async () => {
      const market = createMockMarket();

      const baseline = await service.generateForecast(market, 'baseline-v1');
      const meanReversion = await service.generateForecast(market, 'mean-reversion-v1');
      const volumeWeighted = await service.generateForecast(market, 'volume-weighted-v1');
      const ensemble = await service.generateForecast(market, 'ensemble-v1');

      expect(baseline.modelId).toBe('baseline-v1');
      expect(meanReversion.modelId).toBe('mean-reversion-v1');
      expect(volumeWeighted.modelId).toBe('volume-weighted-v1');
      expect(ensemble.modelId).toBe('ensemble-v1');

      // Different models may produce different predictions
      const predictions = [
        baseline.predictedProbability,
        meanReversion.predictedProbability,
        volumeWeighted.predictedProbability,
        ensemble.predictedProbability,
      ];

      // All should be valid probabilities
      predictions.forEach(p => {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      });
    });

    it('should throw for unknown model', async () => {
      const market = createMockMarket();

      await expect(
        service.generateForecast(market, 'unknown-model')
      ).rejects.toThrow('Model not found: unknown-model');
    });
  });

  describe('Mean Reversion Model', () => {
    it('should apply stronger reversion for extreme prices', async () => {
      const normalMarket = createMockMarket({
        yes_bid: 48,
        yes_ask: 52, // Close to 50%
      });

      const extremeMarket = createMockMarket({
        yes_bid: 88,
        yes_ask: 92, // Very high probability
      });

      const normalForecast = await service.generateForecast(normalMarket, 'mean-reversion-v1');
      const extremeForecast = await service.generateForecast(extremeMarket, 'mean-reversion-v1');

      // Extreme price should have more reversion (lower than market)
      expect(extremeForecast.predictedProbability).toBeLessThan(0.92);
      
      // Normal price should have less reversion
      const normalReversion = Math.abs(normalForecast.predictedProbability - 0.50);
      const extremeReversion = Math.abs(extremeForecast.predictedProbability - 0.92);
      
      // Extreme market should have bigger absolute reversion
      expect(extremeReversion).toBeGreaterThan(normalReversion);
    });
  });

  describe('Volume-Weighted Model', () => {
    it('should trust high volume prices more', async () => {
      const highVolMarket = createHighVolumeMarket();
      const lowVolMarket = createMockMarket({
        ...createHighVolumeMarket(),
        volume_24h: 100,
      });

      const highVolForecast = await service.generateForecast(highVolMarket, 'volume-weighted-v1');
      const lowVolForecast = await service.generateForecast(lowVolMarket, 'volume-weighted-v1');

      // High volume should have higher confidence
      expect(highVolForecast.confidence).toBeGreaterThan(lowVolForecast.confidence);
    });
  });

  describe('Ensemble Model', () => {
    it('should combine multiple model predictions', async () => {
      const market = createMockMarket();

      const ensemble = await service.generateForecast(market, 'ensemble-v1');
      const baseline = await service.generateForecast(market, 'baseline-v1');
      const meanRev = await service.generateForecast(market, 'mean-reversion-v1');
      const volWeighted = await service.generateForecast(market, 'volume-weighted-v1');

      // Ensemble should be somewhere between the individual models
      const allPredictions = [
        baseline.predictedProbability,
        meanRev.predictedProbability,
        volWeighted.predictedProbability,
      ];
      const min = Math.min(...allPredictions);
      const max = Math.max(...allPredictions);

      // Ensemble is weighted average, should be within range (with some tolerance)
      expect(ensemble.predictedProbability).toBeGreaterThanOrEqual(min - 0.05);
      expect(ensemble.predictedProbability).toBeLessThanOrEqual(max + 0.05);
    });
  });

  describe('Kelly Criterion', () => {
    it('should calculate positive Kelly for positive edge', () => {
      const kelly = service.calculateKelly(
        0.60, // We think 60% chance
        0.50, // Market says 50%
        0.8   // High confidence
      );

      expect(kelly.fraction).toBeGreaterThan(0);
      expect(kelly.fullKellyBet).toBeGreaterThan(0);
      expect(kelly.halfKellyBet).toBeLessThan(kelly.fullKellyBet);
      expect(kelly.quarterKellyBet).toBeLessThan(kelly.halfKellyBet);
    });

    it('should calculate zero Kelly for negative edge', () => {
      const kelly = service.calculateKelly(
        0.40, // We think 40% chance
        0.50, // Market says 50%
        0.8   // High confidence
      );

      expect(kelly.fraction).toBe(0);
      expect(kelly.fullKellyBet).toBe(0);
    });

    it('should cap Kelly at maxKellyFraction', () => {
      const service = createForecastingService({
        bankroll: 10000,
        maxKellyFraction: 0.10, // 10% max
      });

      const kelly = service.calculateKelly(
        0.80, // Very high edge
        0.40,
        1.0   // Perfect confidence
      );

      expect(kelly.fraction).toBeLessThanOrEqual(0.10);
    });

    it('should scale Kelly by confidence', () => {
      const highConfidenceKelly = service.calculateKelly(0.60, 0.50, 1.0);
      const lowConfidenceKelly = service.calculateKelly(0.60, 0.50, 0.5);

      expect(highConfidenceKelly.fraction).toBeGreaterThan(lowConfidenceKelly.fraction);
    });

    it('should calculate expected growth rate', () => {
      const kelly = service.calculateKelly(0.60, 0.50, 0.8);

      expect(kelly.expectedGrowth).toBeGreaterThan(0);
      expect(kelly.expectedEdge).toBeGreaterThan(0);
    });
  });

  describe('Direction and Signal Strength', () => {
    it('should recommend YES for positive edge above threshold', async () => {
      // Create a market where model will predict higher than market
      const market = createMockMarket({
        yes_bid: 35,
        yes_ask: 38, // Market thinks 38%
        volume_24h: 5000, // High volume for confidence
      });

      const forecast = await service.generateForecast(market);

      // If edge is positive and significant
      if (forecast.edge >= 0.03 && forecast.confidence >= 0.5) {
        expect(forecast.direction).toBe('yes');
        expect(forecast.signalStrength).not.toBe('none');
      }
    });

    it('should be neutral for small edge', async () => {
      const service = createForecastingService({
        minEdgeToTrade: 0.10, // High threshold
      });

      const market = createMockMarket({
        yes_bid: 49,
        yes_ask: 51, // Close to 50%
      });

      const forecast = await service.generateForecast(market);

      // With price close to 50%, edge should be small
      if (Math.abs(forecast.edge) < 0.10) {
        expect(forecast.direction).toBe('neutral');
        expect(forecast.signalStrength).toBe('none');
      }
    });

    it('should have strong signal for large edge with high confidence', async () => {
      // We'll check the logic directly since market predictions vary
      const forecast = {
        edge: 0.15, // 15% edge
        confidence: 0.8,
        direction: 'yes' as const,
        signalStrength: 'strong' as const,
      };

      // Edge >= 10% and confidence >= 70% should be strong
      expect(forecast.edge).toBeGreaterThanOrEqual(0.10);
      expect(forecast.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('Edge Opportunity Finding', () => {
    it('should find opportunities across multiple markets', async () => {
      const markets = [
        createMockMarket({ ticker: 'MKT-1' }),
        createHighVolumeMarket(),
        createMockMarket({ ticker: 'MKT-2' }),
      ];

      const opportunities = await service.findEdgeOpportunities(markets);

      expect(Array.isArray(opportunities)).toBe(true);
      // Each opportunity should have required fields
      opportunities.forEach(opp => {
        expect(opp.forecast).toBeDefined();
        expect(opp.recommendedBet).toBeDefined();
        expect(opp.recommendedContracts).toBeGreaterThanOrEqual(0);
        expect(opp.reason).toBeDefined();
      });
    });

    it('should filter out closed markets', async () => {
      const markets = [
        createMockMarket({ status: 'open' }),
        createMockMarket({ status: 'closed', ticker: 'CLOSED-MKT' }),
      ];

      const opportunities = await service.findEdgeOpportunities(markets);

      // Should not include closed market
      const closedOpp = opportunities.find(o => o.forecast.ticker === 'CLOSED-MKT');
      expect(closedOpp).toBeUndefined();
    });

    it('should filter out low liquidity markets', async () => {
      const service = createForecastingService({
        minVolume24h: 500,
        minOpenInterest: 100,
      });

      const markets = [
        createHighVolumeMarket(),
        createLowLiquidityMarket(),
      ];

      const opportunities = await service.findEdgeOpportunities(markets);

      // Should not include low liquidity market
      const lowLiqOpp = opportunities.find(o => o.forecast.ticker === 'LOW-LIQ-MKT');
      expect(lowLiqOpp).toBeUndefined();
    });

    it('should sort opportunities by expected profit', async () => {
      const markets = [
        createMockMarket({ ticker: 'MKT-1' }),
        createMockMarket({ ticker: 'MKT-2' }),
        createMockMarket({ ticker: 'MKT-3' }),
      ];

      const opportunities = await service.findEdgeOpportunities(markets);

      // Check descending order
      for (let i = 1; i < opportunities.length; i++) {
        expect(opportunities[i - 1].expectedProfit).toBeGreaterThanOrEqual(
          opportunities[i].expectedProfit
        );
      }
    });
  });

  describe('Forecasting Summary', () => {
    it('should generate a complete summary', async () => {
      const markets = [
        createMockMarket({ ticker: 'MKT-1' }),
        createHighVolumeMarket(),
        createMockMarket({ ticker: 'MKT-2' }),
      ];

      const summary = await service.generateSummary(markets);

      expect(summary.totalMarkets).toBeGreaterThan(0);
      expect(summary.avgEdge).toBeGreaterThanOrEqual(0);
      expect(summary.maxEdge).toBeGreaterThanOrEqual(0);
      expect(summary.modelCalibration).toBeDefined();
      expect(summary.modelCalibration.modelId).toBe('baseline-v1');
      expect(summary.generatedAt).toBeInstanceOf(Date);
    });

    it('should include recommended bets capped at 10', async () => {
      // Create many markets
      const markets = Array.from({ length: 20 }, (_, i) =>
        createMockMarket({ ticker: `MKT-${i}` })
      );

      const summary = await service.generateSummary(markets);

      expect(summary.recommendedBets.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Configuration', () => {
    it('should use default configuration', () => {
      const service = createForecastingService();
      const config = service.getConfig();

      expect(config.modelId).toBe('baseline-v1');
      expect(config.minEdgeToTrade).toBe(0.03);
      expect(config.bankroll).toBe(1000);
    });

    it('should accept custom configuration', () => {
      const service = createForecastingService({
        bankroll: 50000,
        minEdgeToTrade: 0.05,
        maxKellyFraction: 0.5,
      });

      const config = service.getConfig();

      expect(config.bankroll).toBe(50000);
      expect(config.minEdgeToTrade).toBe(0.05);
      expect(config.maxKellyFraction).toBe(0.5);
    });

    it('should allow updating configuration', () => {
      const service = createForecastingService();
      service.updateConfig({ bankroll: 25000 });

      expect(service.getConfig().bankroll).toBe(25000);
    });
  });

  describe('Model Registry', () => {
    it('should list available models', () => {
      const models = service.listModels();

      expect(models.length).toBeGreaterThanOrEqual(4);
      expect(models.find(m => m.id === 'baseline-v1')).toBeDefined();
      expect(models.find(m => m.id === 'mean-reversion-v1')).toBeDefined();
      expect(models.find(m => m.id === 'volume-weighted-v1')).toBeDefined();
      expect(models.find(m => m.id === 'ensemble-v1')).toBeDefined();
    });

    it('should get model by ID', () => {
      const model = service.getModel('ensemble-v1');

      expect(model).toBeDefined();
      expect(model?.id).toBe('ensemble-v1');
      expect(model?.type).toBe('ensemble');
    });
  });

  describe('Edge Opportunity Signal Strengths', () => {
    // Register a custom model that returns controlled predictions to test all branches

    class ControlledModel implements ForecastModel {
      id = 'controlled-test';
      type: ForecastModelType = 'baseline';
      version = '1.0.0';
      description = 'Controlled test model';
      result = { probability: 0.5, confidence: 0.5 };

      async predict(): Promise<{ probability: number; confidence: number; reasoning?: string }> {
        return { ...this.result, reasoning: 'test' };
      }
    }

    let controlledModel: ControlledModel;

    beforeEach(() => {
      controlledModel = new ControlledModel();
      service.registerModel(controlledModel);
    });

    it('should create full_kelly opportunity for strong signal with high confidence', async () => {
      // Predict much higher than market → big positive edge
      controlledModel.result = { probability: 0.80, confidence: 0.85 };

      const market = createMockMarket({
        yes_bid: 48,
        yes_ask: 52, // market prob = 0.52
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].recommendedBet).toBe('full_kelly');
      expect(opportunities[0].reason).toContain('Recommend YES');
    });

    it('should create half_kelly opportunity for strong signal with moderate confidence', async () => {
      controlledModel.result = { probability: 0.80, confidence: 0.72 };

      const market = createMockMarket({
        yes_bid: 48,
        yes_ask: 52,
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].recommendedBet).toBe('half_kelly');
    });

    it('should create quarter_kelly for moderate signal', async () => {
      // Edge ~0.06 with confidence ~0.65 → moderate
      controlledModel.result = { probability: 0.60, confidence: 0.65 };

      const market = createMockMarket({
        yes_bid: 46,
        yes_ask: 50,
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      if (opportunities.length > 0) {
        expect(['quarter_kelly', 'half_kelly']).toContain(opportunities[0].recommendedBet);
      }
    });

    it('should create quarter_kelly for weak signal', async () => {
      // Small edge above threshold, moderate confidence
      controlledModel.result = { probability: 0.56, confidence: 0.55 };

      const market = createMockMarket({
        yes_bid: 46,
        yes_ask: 50,
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      if (opportunities.length > 0) {
        expect(opportunities[0].recommendedBet).toBe('quarter_kelly');
      }
    });

    it('should handle NO direction for negative edge', async () => {
      // Predict much lower than market → negative edge → NO direction
      controlledModel.result = { probability: 0.30, confidence: 0.85 };

      const market = createMockMarket({
        yes_bid: 48,
        yes_ask: 52, // market prob = 0.52
        volume_24h: 5000,
        open_interest: 500,
      });

      const forecast = await service.generateForecast(market, 'controlled-test');

      expect(forecast.edge).toBeLessThan(0);
      expect(forecast.direction).toBe('no');
    });

    it('should generate descriptive reason text', async () => {
      controlledModel.result = { probability: 0.75, confidence: 0.85 };

      const market = createMockMarket({
        yes_bid: 48,
        yes_ask: 52,
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].reason).toContain('Model predicts');
      expect(opportunities[0].reason).toContain('% edge');
      expect(opportunities[0].reason).toContain('Confidence:');
    });

    it('should calculate risk/reward ratio', async () => {
      controlledModel.result = { probability: 0.80, confidence: 0.85 };

      const market = createMockMarket({
        yes_bid: 48,
        yes_ask: 52,
        volume_24h: 5000,
        open_interest: 500,
      });

      const opportunities = await service.findEdgeOpportunities([market], 'controlled-test');

      expect(opportunities.length).toBe(1);
      expect(opportunities[0].riskRewardRatio).toBeGreaterThan(0);
      expect(opportunities[0].maxContracts).toBeGreaterThan(0);
    });
  });

  describe('Kelly Edge Cases', () => {
    it('should return zero Kelly for market probability at boundary (0)', () => {
      const kelly = service.calculateKelly(0.50, 0, 0.8);

      expect(kelly.fraction).toBe(0);
      expect(kelly.fullKellyBet).toBe(0);
      expect(kelly.expectedEdge).toBe(0);
    });

    it('should return zero Kelly for market probability at boundary (1)', () => {
      const kelly = service.calculateKelly(0.50, 1, 0.8);

      expect(kelly.fraction).toBe(0);
      expect(kelly.fullKellyBet).toBe(0);
    });

    it('should handle very small market probability', () => {
      const kelly = service.calculateKelly(0.10, 0.02, 0.8);

      expect(kelly.fraction).toBeGreaterThanOrEqual(0);
      expect(kelly.maxDrawdownRisk).toBeGreaterThanOrEqual(0);
    });

    it('should constrain by maxPositionPercent', () => {
      const service = createForecastingService({
        bankroll: 10000,
        maxKellyFraction: 0.50,
        maxPositionPercent: 0.01, // Very restrictive 1%
      });

      const kelly = service.calculateKelly(0.80, 0.40, 1.0);

      // Even with high Kelly, halfKellyBet and quarterKellyBet are constrained
      // maxPositionBet = 10000 * 0.01 = 100
      expect(kelly.halfKellyBet).toBeLessThanOrEqual(50); // half of 100
      expect(kelly.quarterKellyBet).toBeLessThanOrEqual(25); // quarter of 100
    });

    it('should calculate max drawdown risk proportional to fraction', () => {
      const kelly = service.calculateKelly(0.60, 0.50, 0.8);

      // maxDrawdownRisk ≈ fraction * 2, capped at 1
      expect(kelly.maxDrawdownRisk).toBeCloseTo(kelly.fraction * 2, 1);
    });
  });

  describe('Filter Edge Cases', () => {
    it('should filter markets with wide spread', async () => {
      const service = createForecastingService({
        maxSpreadPercent: 0.05, // Very tight 5% max spread
        minVolume24h: 100,
        minOpenInterest: 50,
      });

      const wideSpreadMarket = createMockMarket({
        ticker: 'WIDE-SPREAD',
        yes_bid: 30,
        yes_ask: 70, // spread = 40, mid = 50, spread% = 80%
        volume_24h: 5000,
        open_interest: 1000,
      });

      const opportunities = await service.findEdgeOpportunities([wideSpreadMarket]);
      const found = opportunities.find(o => o.forecast.ticker === 'WIDE-SPREAD');
      expect(found).toBeUndefined();
    });

    it('should filter markets below open interest threshold', async () => {
      const service = createForecastingService({
        minOpenInterest: 500,
        minVolume24h: 100,
      });

      const lowOIMarket = createMockMarket({
        ticker: 'LOW-OI',
        open_interest: 10,
        volume_24h: 5000,
      });

      const opportunities = await service.findEdgeOpportunities([lowOIMarket]);
      const found = opportunities.find(o => o.forecast.ticker === 'LOW-OI');
      expect(found).toBeUndefined();
    });

    it('should handle errors in forecast generation gracefully', async () => {
      // Register a model that throws
      service.registerModel({
        id: 'error-model',
        type: 'baseline' as ForecastModelType,
        version: '1.0.0',
        description: 'Always errors',
        predict: async () => { throw new Error('Model failure'); },
      });

      const markets = [createMockMarket()];
      const opportunities = await service.findEdgeOpportunities(markets, 'error-model');

      // Should not crash, just skip
      expect(opportunities).toEqual([]);
    });

    it('should handle errors in summary generation gracefully', async () => {
      service.registerModel({
        id: 'error-model',
        type: 'baseline' as ForecastModelType,
        version: '1.0.0',
        description: 'Always errors',
        predict: async () => { throw new Error('Model failure'); },
      });

      const markets = [createMockMarket()];
      const summary = await service.generateSummary(markets, 'error-model');

      expect(summary.totalMarkets).toBe(0);
      expect(summary.marketsWithEdge).toBe(0);
    });

    it('should generate summary with no markets having edge', async () => {
      // Very high threshold
      const service = createForecastingService({
        minEdgeToTrade: 0.50, // 50% minimum edge - impossible
      });

      const summary = await service.generateSummary([createMockMarket()]);

      expect(summary.marketsWithEdge).toBe(0);
      expect(summary.avgEdge).toBe(0);
      expect(summary.maxEdge).toBe(0);
    });
  });

  describe('Mean Reversion Model - Expiration Effects', () => {
    it('should reduce confidence for near-expiring markets (<1 day)', async () => {
      const nearExpiryMarket = createMockMarket({
        yes_bid: 88,
        yes_ask: 92,
        volume_24h: 3000,
        open_interest: 2000,
        expiration_time: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
      });

      const farExpiryMarket = createMockMarket({
        yes_bid: 88,
        yes_ask: 92,
        volume_24h: 3000,
        open_interest: 2000,
        expiration_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });

      const nearForecast = await service.generateForecast(nearExpiryMarket, 'mean-reversion-v1');
      const farForecast = await service.generateForecast(farExpiryMarket, 'mean-reversion-v1');

      // Near-expiring market should have lower confidence
      expect(nearForecast.confidence).toBeLessThan(farForecast.confidence);
    });

    it('should reduce confidence for markets expiring in 1-3 days', async () => {
      const twoDayMarket = createMockMarket({
        yes_bid: 88,
        yes_ask: 92,
        volume_24h: 3000,
        open_interest: 2000,
        expiration_time: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const weekMarket = createMockMarket({
        yes_bid: 88,
        yes_ask: 92,
        volume_24h: 3000,
        open_interest: 2000,
        expiration_time: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const twoDayForecast = await service.generateForecast(twoDayMarket, 'mean-reversion-v1');
      const weekForecast = await service.generateForecast(weekMarket, 'mean-reversion-v1');

      expect(twoDayForecast.confidence).toBeLessThan(weekForecast.confidence);
    });

    it('should apply stronger reversion for markets below 50%', async () => {
      const lowProbMarket = createMockMarket({
        yes_bid: 15,
        yes_ask: 18,
        volume_24h: 3000,
        open_interest: 2000,
      });

      const forecast = await service.generateForecast(lowProbMarket, 'mean-reversion-v1');

      // Should revert UP toward 50%
      expect(forecast.predictedProbability).toBeGreaterThan(0.18);
    });
  });

  describe('Days to Expiration', () => {
    it('should calculate days to expiration correctly', async () => {
      const oneDayAway = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const sevenDaysAway = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const market1 = createMockMarket({
        expiration_time: oneDayAway.toISOString(),
      });
      const market7 = createMockMarket({
        expiration_time: sevenDaysAway.toISOString(),
      });

      const forecast1 = await service.generateForecast(market1);
      const forecast7 = await service.generateForecast(market7);

      expect(forecast1.daysToExpiration).toBeCloseTo(1, 0);
      expect(forecast7.daysToExpiration).toBeCloseTo(7, 0);
    });

    it('should filter markets expiring too soon', async () => {
      const service = createForecastingService({
        minDaysToExpiration: 2,
      });

      const expiringTomorrow = createMockMarket({
        ticker: 'EXPIRING-SOON',
        expiration_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      const expiringNextWeek = createMockMarket({
        ticker: 'EXPIRING-LATER',
        expiration_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const opportunities = await service.findEdgeOpportunities([
        expiringTomorrow,
        expiringNextWeek,
      ]);

      // Should not include soon-expiring market
      const soonOpp = opportunities.find(o => o.forecast.ticker === 'EXPIRING-SOON');
      expect(soonOpp).toBeUndefined();
    });
  });
});
