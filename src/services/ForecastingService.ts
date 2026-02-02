// Forecasting Service
// Extracts implied probabilities, generates forecasts, computes edge, and calculates Kelly sizing

import {
  ImpliedProbability,
  Forecast,
  ForecastModelInput,
  ForecastingConfig,
  EdgeOpportunity,
  KellyResult,
  ForecastingSummary,
  ForecastModel,
  ForecastModelType,
} from '../types/forecasting';
import type { Market } from '../lib/kalshi';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ForecastingConfig = {
  modelId: 'baseline-v1',
  modelVersion: '1.0.0',
  minEdgeToTrade: 0.03,        // 3% minimum edge
  minConfidence: 0.55,          // 55% minimum confidence
  bankroll: 1000,               // $1000 default bankroll
  maxKellyFraction: 0.25,       // Quarter Kelly maximum
  maxPositionPercent: 0.10,     // 10% max per position
  minVolume24h: 100,            // Minimum volume
  minOpenInterest: 50,          // Minimum open interest
  maxSpreadPercent: 0.15,       // 15% max spread
  minDaysToExpiration: 0.5,     // At least 12 hours to expiration
};

// ============================================================================
// Forecast Models
// ============================================================================

/**
 * Baseline model - uses market prices with slight mean reversion
 */
class BaselineModel implements ForecastModel {
  id = 'baseline-v1';
  type: ForecastModelType = 'baseline';
  version = '1.0.0';
  description = 'Simple baseline model using market mid-price with slight mean reversion';

  async predict(input: ForecastModelInput): Promise<{
    probability: number;
    confidence: number;
    reasoning?: string;
  }> {
    // Start with market's implied probability
    let probability = input.impliedProbability;
    
    // Apply slight mean reversion (prices tend to move toward 50%)
    const meanReversionStrength = 0.05;
    const distanceFrom50 = probability - 0.5;
    probability -= distanceFrom50 * meanReversionStrength;
    
    // Adjust for spread - wide spreads suggest uncertainty
    const spreadAdjustment = Math.min(input.spread / 100, 0.1);
    
    // Confidence based on liquidity and spread
    let confidence = 0.5;
    if (input.volume24h > 1000) confidence += 0.1;
    if (input.volume24h > 5000) confidence += 0.1;
    if (input.openInterest > 500) confidence += 0.05;
    if (input.spread < 5) confidence += 0.1;
    if (input.spread > 10) confidence -= 0.1;
    
    // Cap confidence
    confidence = Math.max(0.3, Math.min(0.9, confidence));
    
    return {
      probability: Math.max(0.01, Math.min(0.99, probability)),
      confidence,
      reasoning: `Baseline model: market implied ${(input.impliedProbability * 100).toFixed(1)}%, adjusted to ${(probability * 100).toFixed(1)}% with ${spreadAdjustment > 0.05 ? 'high' : 'normal'} spread uncertainty`,
    };
  }
}

/**
 * Mean Reversion model - assumes extreme prices revert
 */
class MeanReversionModel implements ForecastModel {
  id = 'mean-reversion-v1';
  type: ForecastModelType = 'mean_reversion';
  version = '1.0.0';
  description = 'Mean reversion model - assumes extreme probabilities revert toward 50%';

  async predict(input: ForecastModelInput): Promise<{
    probability: number;
    confidence: number;
    reasoning?: string;
  }> {
    const marketProb = input.impliedProbability;
    
    // Stronger reversion for extreme prices
    const distanceFrom50 = Math.abs(marketProb - 0.5);
    const reversionStrength = distanceFrom50 > 0.3 ? 0.15 : 0.08;
    
    let probability = marketProb;
    if (marketProb > 0.5) {
      probability -= distanceFrom50 * reversionStrength;
    } else {
      probability += distanceFrom50 * reversionStrength;
    }
    
    // Higher confidence when price is extreme (more room for reversion)
    let confidence = 0.5 + distanceFrom50 * 0.5;
    
    // Lower confidence near expiration (less time for reversion)
    if (input.daysToExpiration < 1) {
      confidence *= 0.7;
    } else if (input.daysToExpiration < 3) {
      confidence *= 0.85;
    }
    
    confidence = Math.max(0.3, Math.min(0.85, confidence));
    
    return {
      probability: Math.max(0.01, Math.min(0.99, probability)),
      confidence,
      reasoning: `Mean reversion: ${distanceFrom50 > 0.3 ? 'strong' : 'moderate'} reversion expected from ${(marketProb * 100).toFixed(1)}% toward 50%`,
    };
  }
}

/**
 * Volume-Weighted model - trusts high volume prices more
 */
class VolumeWeightedModel implements ForecastModel {
  id = 'volume-weighted-v1';
  type: ForecastModelType = 'volume_weighted';
  version = '1.0.0';
  description = 'Volume-weighted model - adjusts confidence based on trading activity';

  async predict(input: ForecastModelInput): Promise<{
    probability: number;
    confidence: number;
    reasoning?: string;
  }> {
    // High volume = market is likely efficient, trust the price
    // Low volume = more uncertainty, apply mean reversion
    const volumeScore = Math.min(input.volume24h / 5000, 1);
    const meanReversionStrength = 0.1 * (1 - volumeScore);
    
    let probability = input.impliedProbability;
    const distanceFrom50 = probability - 0.5;
    probability -= distanceFrom50 * meanReversionStrength;
    
    // Confidence scales with volume
    let confidence = 0.4 + volumeScore * 0.4;
    
    // Adjust for open interest
    const oiScore = Math.min(input.openInterest / 1000, 1);
    confidence += oiScore * 0.1;
    
    confidence = Math.max(0.3, Math.min(0.9, confidence));
    
    return {
      probability: Math.max(0.01, Math.min(0.99, probability)),
      confidence,
      reasoning: `Volume-weighted: ${input.volume24h > 2000 ? 'high' : 'low'} volume (${input.volume24h}), trusting market ${volumeScore > 0.5 ? 'more' : 'less'}`,
    };
  }
}

/**
 * Ensemble model - combines multiple models
 */
class EnsembleModel implements ForecastModel {
  id = 'ensemble-v1';
  type: ForecastModelType = 'ensemble';
  version = '1.0.0';
  description = 'Ensemble model combining baseline, mean reversion, and volume-weighted models';

  private models: ForecastModel[] = [
    new BaselineModel(),
    new MeanReversionModel(),
    new VolumeWeightedModel(),
  ];

  async predict(input: ForecastModelInput): Promise<{
    probability: number;
    confidence: number;
    reasoning?: string;
  }> {
    const predictions = await Promise.all(
      this.models.map(m => m.predict(input))
    );
    
    // Weighted average by confidence
    const totalWeight = predictions.reduce((sum, p) => sum + p.confidence, 0);
    const weightedProbability = predictions.reduce(
      (sum, p) => sum + p.probability * p.confidence,
      0
    ) / totalWeight;
    
    // Ensemble confidence is average confidence, slightly boosted for agreement
    const avgConfidence = totalWeight / predictions.length;
    const probabilities = predictions.map(p => p.probability);
    const probStdDev = Math.sqrt(
      probabilities.reduce((sum, p) => sum + Math.pow(p - weightedProbability, 2), 0) / probabilities.length
    );
    
    // Lower standard deviation = more agreement = higher confidence
    const agreementBonus = Math.max(0, 0.1 - probStdDev);
    const confidence = Math.min(0.9, avgConfidence + agreementBonus);
    
    return {
      probability: Math.max(0.01, Math.min(0.99, weightedProbability)),
      confidence,
      reasoning: `Ensemble: ${predictions.length} models, agreement std=${(probStdDev * 100).toFixed(1)}%`,
    };
  }
}

// ============================================================================
// Forecasting Service
// ============================================================================

export class ForecastingService {
  private config: ForecastingConfig;
  private models: Map<string, ForecastModel> = new Map();

  constructor(config: Partial<ForecastingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Register available models
    this.registerModel(new BaselineModel());
    this.registerModel(new MeanReversionModel());
    this.registerModel(new VolumeWeightedModel());
    this.registerModel(new EnsembleModel());
  }

  /**
   * Register a forecast model
   */
  registerModel(model: ForecastModel): void {
    this.models.set(model.id, model);
  }

  /**
   * Get a model by ID
   */
  getModel(modelId: string): ForecastModel | undefined {
    return this.models.get(modelId);
  }

  /**
   * List available models
   */
  listModels(): Array<{ id: string; type: ForecastModelType; description: string }> {
    return Array.from(this.models.values()).map(m => ({
      id: m.id,
      type: m.type,
      description: m.description,
    }));
  }

  /**
   * Extract implied probability from market data
   */
  extractImpliedProbability(market: Market): ImpliedProbability {
    const yesMid = (market.yes_bid + market.yes_ask) / 2;
    const noMid = (market.no_bid + market.no_ask) / 2;
    const yesSpread = market.yes_ask - market.yes_bid;
    const noSpread = market.no_ask - market.no_bid;
    
    return {
      ticker: market.ticker,
      title: market.title,
      eventTicker: market.event_ticker,
      
      // Raw prices (cents)
      yesBid: market.yes_bid,
      yesAsk: market.yes_ask,
      noBid: market.no_bid,
      noAsk: market.no_ask,
      lastPrice: market.last_price,
      
      // Implied probabilities (0-1)
      impliedYesMid: yesMid / 100,
      impliedYesBid: market.yes_bid / 100,
      impliedYesAsk: market.yes_ask / 100,
      impliedNoMid: noMid / 100,
      
      // Spread info
      yesSpread,
      noSpread,
      spreadPercent: yesMid > 0 ? yesSpread / yesMid : 0,
      
      // Liquidity
      volume24h: market.volume_24h,
      openInterest: market.open_interest,
      
      // Metadata
      status: market.status,
      expirationTime: market.expiration_time,
      extractedAt: new Date(),
    };
  }

  /**
   * Generate a forecast for a market
   */
  async generateForecast(
    market: Market,
    modelId: string = this.config.modelId
  ): Promise<Forecast> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const implied = this.extractImpliedProbability(market);
    const daysToExpiration = this.calculateDaysToExpiration(market.expiration_time);
    
    // Prepare model input
    const input: ForecastModelInput = {
      ticker: market.ticker,
      impliedProbability: implied.impliedYesMid,
      lastPrice: market.last_price,
      volume24h: market.volume_24h,
      openInterest: market.open_interest,
      spread: implied.yesSpread,
      daysToExpiration,
    };

    // Get model prediction
    const prediction = await model.predict(input);
    
    // Calculate edge
    const marketProbability = implied.impliedYesAsk; // Already 0-1 from extraction
    const edge = prediction.probability - marketProbability;
    const edgeCents = edge * 100;
    const edgePercent = marketProbability > 0 ? (edge / marketProbability) * 100 : 0;
    
    // Determine direction and signal strength
    const direction = this.determineDirection(edge, prediction.confidence);
    const signalStrength = this.determineSignalStrength(edge, prediction.confidence);
    
    // Calculate Kelly sizing
    const kelly = this.calculateKelly(
      prediction.probability,
      marketProbability,
      prediction.confidence
    );
    
    // Risk metrics
    const expectedValue = edge; // Expected profit per dollar at fair odds
    const maxLoss = market.yes_ask; // Max loss is the price paid (in cents)
    const probabilityOfProfit = prediction.probability;

    return {
      id: crypto.randomUUID(),
      ticker: market.ticker,
      title: market.title,
      eventTicker: market.event_ticker,
      
      modelId,
      modelVersion: model.version,
      predictedProbability: prediction.probability,
      confidence: prediction.confidence,
      
      marketProbability,
      marketPrice: market.yes_ask,
      
      edge,
      edgeCents,
      edgePercent,
      
      direction,
      signalStrength,
      
      kellyFraction: kelly.fraction,
      kellyFullBet: kelly.fullKellyBet,
      kellyHalfBet: kelly.halfKellyBet,
      kellyQuarterBet: kelly.quarterKellyBet,
      
      expectedValue,
      maxLoss,
      probabilityOfProfit,
      
      createdAt: new Date(),
      expirationTime: market.expiration_time,
      daysToExpiration,
    };
  }

  /**
   * Calculate Kelly criterion bet sizing
   */
  calculateKelly(
    winProbability: number,
    marketProbability: number,
    confidence: number
  ): KellyResult {
    // Kelly formula: f* = (bp - q) / b
    // where b = odds received on the bet (payout - 1)
    //       p = probability of winning
    //       q = probability of losing (1 - p)
    
    // For binary markets: if we pay marketProbability and receive 1 if correct
    // b = (1 / marketProbability) - 1 = (1 - marketProbability) / marketProbability
    
    if (marketProbability <= 0 || marketProbability >= 1) {
      return this.zeroKelly();
    }
    
    const b = (1 - marketProbability) / marketProbability;
    const p = winProbability;
    const q = 1 - p;
    
    // Raw Kelly fraction
    let rawKelly = (b * p - q) / b;
    
    // Adjust for confidence (fractional Kelly based on uncertainty)
    rawKelly *= confidence;
    
    // Cap at configured maximum
    const fraction = Math.max(0, Math.min(this.config.maxKellyFraction, rawKelly));
    
    // Calculate bet sizes
    const fullKellyBet = rawKelly > 0 ? rawKelly * this.config.bankroll : 0;
    const cappedBet = fraction * this.config.bankroll;
    
    // Also cap by position limit
    const maxPositionBet = this.config.bankroll * this.config.maxPositionPercent;
    const finalBet = Math.min(cappedBet, maxPositionBet);
    
    // Expected edge and growth
    const expectedEdge = p * (1 / marketProbability - 1) - q;
    const expectedGrowth = fraction > 0 
      ? p * Math.log(1 + fraction * (1 / marketProbability - 1)) + q * Math.log(1 - fraction)
      : 0;
    
    // Approximate max drawdown risk (rule of thumb: ~2x Kelly = 13.5% drawdown)
    const maxDrawdownRisk = fraction > 0 ? Math.min(1, fraction * 2) : 0;

    return {
      fraction,
      fullKellyBet: Math.max(0, fullKellyBet),
      halfKellyBet: Math.max(0, finalBet / 2),
      quarterKellyBet: Math.max(0, finalBet / 4),
      expectedEdge,
      expectedGrowth,
      maxDrawdownRisk,
    };
  }

  /**
   * Find edge opportunities across multiple markets
   */
  async findEdgeOpportunities(
    markets: Market[],
    modelId: string = this.config.modelId
  ): Promise<EdgeOpportunity[]> {
    const opportunities: EdgeOpportunity[] = [];
    
    for (const market of markets) {
      // Skip closed markets
      if (market.status !== 'open') continue;
      
      // Check filters
      if (!this.passesFilters(market)) continue;
      
      try {
        const forecast = await this.generateForecast(market, modelId);
        
        // Check if edge meets threshold
        if (Math.abs(forecast.edge) >= this.config.minEdgeToTrade) {
          const opportunity = this.createEdgeOpportunity(forecast);
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }
      } catch {
        // Skip markets that fail to forecast
        continue;
      }
    }
    
    // Sort by expected profit descending
    opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);
    
    return opportunities;
  }

  /**
   * Generate a forecasting summary
   */
  async generateSummary(
    markets: Market[],
    modelId: string = this.config.modelId
  ): Promise<ForecastingSummary> {
    const forecasts: Forecast[] = [];
    
    for (const market of markets) {
      if (market.status !== 'open') continue;
      if (!this.passesFilters(market)) continue;
      
      try {
        const forecast = await this.generateForecast(market, modelId);
        forecasts.push(forecast);
      } catch {
        continue;
      }
    }
    
    const marketsWithEdge = forecasts.filter(
      f => Math.abs(f.edge) >= this.config.minEdgeToTrade
    );
    
    const opportunities = await this.findEdgeOpportunities(markets, modelId);
    
    const avgEdge = marketsWithEdge.length > 0
      ? marketsWithEdge.reduce((sum, f) => sum + Math.abs(f.edge), 0) / marketsWithEdge.length
      : 0;
    
    const maxEdge = marketsWithEdge.length > 0
      ? Math.max(...marketsWithEdge.map(f => Math.abs(f.edge)))
      : 0;
    
    const totalExpectedValue = opportunities.reduce((sum, o) => sum + o.expectedProfit, 0);

    return {
      totalMarkets: forecasts.length,
      marketsWithEdge: marketsWithEdge.length,
      avgEdge,
      maxEdge,
      totalExpectedValue,
      recommendedBets: opportunities.slice(0, 10), // Top 10
      modelCalibration: {
        modelId,
        totalPredictions: forecasts.length,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ForecastingConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): ForecastingConfig {
    return { ...this.config };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private calculateDaysToExpiration(expirationTime: string): number {
    const now = new Date();
    const expiration = new Date(expirationTime);
    const diffMs = expiration.getTime() - now.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  }

  private determineDirection(edge: number, confidence: number): 'yes' | 'no' | 'neutral' {
    if (Math.abs(edge) < this.config.minEdgeToTrade) return 'neutral';
    if (confidence < this.config.minConfidence) return 'neutral';
    return edge > 0 ? 'yes' : 'no';
  }

  private determineSignalStrength(
    edge: number,
    confidence: number
  ): 'strong' | 'moderate' | 'weak' | 'none' {
    const absEdge = Math.abs(edge);
    
    if (absEdge < this.config.minEdgeToTrade || confidence < this.config.minConfidence) {
      return 'none';
    }
    
    if (absEdge >= 0.10 && confidence >= 0.7) return 'strong';
    if (absEdge >= 0.05 && confidence >= 0.6) return 'moderate';
    return 'weak';
  }

  private passesFilters(market: Market): boolean {
    // Volume filter
    if (market.volume_24h < this.config.minVolume24h) return false;
    
    // Open interest filter
    if (market.open_interest < this.config.minOpenInterest) return false;
    
    // Spread filter
    const yesMid = (market.yes_bid + market.yes_ask) / 2;
    const spread = market.yes_ask - market.yes_bid;
    if (yesMid > 0 && spread / yesMid > this.config.maxSpreadPercent) return false;
    
    // Expiration filter
    const daysToExpiration = this.calculateDaysToExpiration(market.expiration_time);
    if (daysToExpiration < this.config.minDaysToExpiration) return false;
    
    return true;
  }

  private createEdgeOpportunity(forecast: Forecast): EdgeOpportunity | null {
    if (forecast.direction === 'neutral') return null;
    
    // Determine recommended bet size based on signal strength
    let recommendedBet: EdgeOpportunity['recommendedBet'];
    let betAmount: number;
    
    if (forecast.signalStrength === 'strong' && forecast.confidence >= 0.8) {
      // Only use full Kelly for very high confidence strong signals
      recommendedBet = 'full_kelly';
      betAmount = forecast.kellyFullBet;
    } else if (forecast.signalStrength === 'strong') {
      recommendedBet = 'half_kelly';
      betAmount = forecast.kellyHalfBet;
    } else if (forecast.signalStrength === 'moderate') {
      recommendedBet = 'quarter_kelly';
      betAmount = forecast.kellyQuarterBet;
    } else if (forecast.signalStrength === 'weak') {
      recommendedBet = 'quarter_kelly';
      betAmount = forecast.kellyQuarterBet;
    } else {
      recommendedBet = 'no_bet';
      betAmount = 0;
    }
    
    // Convert to contracts (each contract is priced in cents, pays $1)
    const contractPrice = forecast.marketPrice / 100; // Convert cents to dollars
    const recommendedContracts = contractPrice > 0 
      ? Math.floor(betAmount / contractPrice) 
      : 0;
    
    // Calculate expected profit
    const expectedProfit = recommendedContracts * forecast.edgeCents / 100; // Convert to dollars
    
    // Risk/reward ratio
    const maxLossPerContract = contractPrice;
    const maxGainPerContract = 1 - contractPrice;
    const riskRewardRatio = maxLossPerContract > 0 
      ? maxGainPerContract / maxLossPerContract 
      : 0;
    
    // Generate reason
    const reason = this.generateReason(forecast);

    return {
      forecast,
      recommendedBet,
      recommendedContracts,
      maxContracts: Math.floor((this.config.bankroll * this.config.maxPositionPercent) / contractPrice),
      expectedProfit,
      riskRewardRatio,
      reason,
    };
  }

  private generateReason(forecast: Forecast): string {
    const direction = forecast.direction.toUpperCase();
    const edgePct = (forecast.edge * 100).toFixed(1);
    const confPct = (forecast.confidence * 100).toFixed(0);
    const modelProb = (forecast.predictedProbability * 100).toFixed(1);
    const marketProb = (forecast.marketProbability * 100).toFixed(1);
    
    return `Model predicts ${modelProb}% vs market ${marketProb}% (${edgePct}% edge). ` +
      `Confidence: ${confPct}%. Recommend ${direction}.`;
  }

  private zeroKelly(): KellyResult {
    return {
      fraction: 0,
      fullKellyBet: 0,
      halfKellyBet: 0,
      quarterKellyBet: 0,
      expectedEdge: 0,
      expectedGrowth: 0,
      maxDrawdownRisk: 0,
    };
  }
}

// Factory function
export function createForecastingService(
  config: Partial<ForecastingConfig> = {}
): ForecastingService {
  return new ForecastingService(config);
}
