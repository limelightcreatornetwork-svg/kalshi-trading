// Value/Mispricing Strategy
// Detects when market prices diverge from fair value estimates

import { BaseStrategy } from './BaseStrategy';
import {
  StrategyType,
  StrategyConfig,
  StrategyContext,
  Signal,
  SignalType,
} from '../../types/strategy';

export interface ValueStrategyParams {
  // Minimum edge to generate signal (cents)
  minEdge: number;
  
  // Minimum confidence to trade
  minConfidence: number;
  
  // Use aggressive pricing (market vs limit)
  useAggressivePricing: boolean;
  
  // Maximum price to pay for any side
  maxPrice: number;
  
  // Model weights for probability estimation
  modelWeights?: {
    lastPrice: number;
    mid: number;
    vwap: number;
  };
}

const DEFAULT_PARAMS: ValueStrategyParams = {
  minEdge: 2,           // 2 cents minimum edge
  minConfidence: 0.55,  // 55% minimum confidence
  useAggressivePricing: false,
  maxPrice: 90,         // Don't pay more than 90 cents
  modelWeights: {
    lastPrice: 0.4,
    mid: 0.4,
    vwap: 0.2,
  },
};

export class ValueStrategy extends BaseStrategy {
  private params: ValueStrategyParams;

  constructor(config?: Partial<StrategyConfig>) {
    super(
      config?.id || crypto.randomUUID(),
      StrategyType.VALUE,
      config?.name || 'Value Strategy',
      'Detects mispriced markets by comparing model fair value to market prices'
    );
    
    this.params = {
      ...DEFAULT_PARAMS,
      ...(config?.params as Partial<ValueStrategyParams>),
    };
  }

  protected async onInitialize(): Promise<void> {
    // Merge params from config
    this.params = {
      ...this.params,
      ...(this.config.params as Partial<ValueStrategyParams>),
    };
    
    this.log('info', 'Initialized', { params: this.params });
  }

  async generateSignals(context: StrategyContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Skip if liquidity check fails
    if (!this.passesLiquidityCheck(context)) {
      return signals;
    }

    // Calculate fair value
    const fairValue = this.calculateFairValue(context);
    
    // Get current market prices
    const yesAsk = context.market.yesAsk;
    const noAsk = context.market.noAsk;

    // Check for YES mispricing (market undervalues YES)
    const yesEdge = fairValue.yes - yesAsk;
    if (yesEdge >= this.params.minEdge && yesAsk <= this.params.maxPrice) {
      const confidence = this.calculateConfidence(fairValue.yes, yesAsk, context);
      
      if (confidence >= this.params.minConfidence) {
        signals.push(this.createSignal(context, {
          type: SignalType.ENTRY,
          direction: 'yes',
          strength: Math.min(yesEdge / 10, 1), // Normalize strength
          confidence,
          targetPrice: fairValue.yes,
          reason: `YES underpriced: market ${yesAsk}¢ vs fair value ${fairValue.yes.toFixed(1)}¢ (${yesEdge.toFixed(1)}¢ edge)`,
        }));
      }
    }

    // Check for NO mispricing (market undervalues NO)
    const noEdge = fairValue.no - noAsk;
    if (noEdge >= this.params.minEdge && noAsk <= this.params.maxPrice) {
      const confidence = this.calculateConfidence(fairValue.no, noAsk, context);
      
      if (confidence >= this.params.minConfidence) {
        signals.push(this.createSignal(context, {
          type: SignalType.ENTRY,
          direction: 'no',
          strength: Math.min(noEdge / 10, 1),
          confidence,
          targetPrice: fairValue.no,
          reason: `NO underpriced: market ${noAsk}¢ vs fair value ${fairValue.no.toFixed(1)}¢ (${noEdge.toFixed(1)}¢ edge)`,
        }));
      }
    }

    // Exit signals for existing positions
    if (context.position) {
      const exitSignal = this.checkExitSignal(context, fairValue);
      if (exitSignal) {
        signals.push(exitSignal);
      }
    }

    return signals;
  }

  /**
   * Calculate fair value based on model
   */
  private calculateFairValue(context: StrategyContext): { yes: number; no: number } {
    const weights = this.params.modelWeights!;
    
    // Simple model: weighted average of different price signals
    const lastPrice = context.market.lastPrice;
    const yesMid = this.getMidPrice(context.market.yesBid, context.market.yesAsk);
    
    // For demonstration, use simple weighted average
    // In production, this would be a more sophisticated model
    const yesFair = 
      weights.lastPrice * lastPrice +
      weights.mid * yesMid +
      weights.vwap * yesMid; // Placeholder for VWAP
    
    // NO fair value = 100 - YES fair value (binary constraint)
    const noFair = 100 - yesFair;

    return {
      yes: yesFair,
      no: noFair,
    };
  }

  /**
   * Calculate confidence in the signal
   */
  private calculateConfidence(
    fairValue: number,
    marketPrice: number,
    context: StrategyContext
  ): number {
    // Base confidence from edge size
    const edge = fairValue - marketPrice;
    let confidence = 0.5 + (edge / 100); // Linear scaling

    // Adjust for spread (wider spread = less confident)
    const spread = context.market.yesAsk - context.market.yesBid;
    if (spread > 5) {
      confidence -= 0.05 * (spread - 5) / 5;
    }

    // Adjust for volume (higher volume = more confident)
    if (context.market.volume24h > 10000) {
      confidence += 0.05;
    }

    // Adjust for open interest
    if (context.market.openInterest > 5000) {
      confidence += 0.03;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Check if we should exit an existing position
   */
  private checkExitSignal(
    context: StrategyContext,
    fairValue: { yes: number; no: number }
  ): Signal | null {
    const position = context.position!;
    
    // Exit if position is now overvalued
    if (position.side === 'yes') {
      const yesBid = context.market.yesBid;
      if (yesBid > fairValue.yes + 2) {
        // Market values YES higher than we do - sell
        return this.createSignal(context, {
          type: SignalType.EXIT,
          direction: 'yes',
          strength: 0.7,
          confidence: 0.6,
          targetPrice: yesBid,
          reason: `YES overpriced: market bid ${yesBid}¢ > fair value ${fairValue.yes.toFixed(1)}¢ - exit`,
        });
      }
    } else {
      const noBid = context.market.noBid;
      if (noBid > fairValue.no + 2) {
        return this.createSignal(context, {
          type: SignalType.EXIT,
          direction: 'no',
          strength: 0.7,
          confidence: 0.6,
          targetPrice: noBid,
          reason: `NO overpriced: market bid ${noBid}¢ > fair value ${fairValue.no.toFixed(1)}¢ - exit`,
        });
      }
    }

    return null;
  }
}

// Factory function for registry
export function createValueStrategy(config: StrategyConfig): ValueStrategy {
  return new ValueStrategy(config);
}
