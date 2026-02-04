// Pre-Trade Risk Check Service
// Validates orders against spread, liquidity, slippage, and other guardrails

import { KillSwitchService } from './KillSwitchService';
import { PositionCapService } from './PositionCapService';
import { DailyPnLService } from './DailyPnLService';

export interface OrderCheckRequest {
  marketId: string;
  marketTicker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  quantity: number;
  limitPrice?: number;    // For limit orders
  strategyId?: string;
  
  // Market data at order time
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  
  // Optional orderbook for slippage check
  orderbook?: {
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
  };
}

export interface OrderCheckResult {
  approved: boolean;
  checks: CheckResult[];
  estimatedSlippage?: number;
  adjustedPrice?: number;
  blockingReason?: string;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  severity: 'info' | 'warning' | 'error';
  value?: number;
  limit?: number;
}

export interface PreTradeCheckConfig {
  // Spread limits
  maxSpread: number;           // Max bid-ask spread (cents)
  maxSpreadPct: number;        // Max spread as % of mid price
  
  // Liquidity limits
  minDepthAtTop: number;       // Min contracts at best bid/ask
  minTotalDepth: number;       // Min total orderbook depth
  
  // Slippage limits
  maxSlippage: number;         // Max expected slippage (cents)
  maxSlippagePct: number;      // Max slippage as % of price
  
  // Order size limits
  maxOrderSize: number;        // Max contracts per order
  maxOrderNotional: number;    // Max $ per order
  
  // Price limits
  minPrice: number;            // Don't trade below this (cents)
  maxPrice: number;            // Don't trade above this (cents)
  
  // Crossing limits
  maxCrossingTolerance: number; // How far to cross the spread (cents)
  
  // Feature flags
  requireKillSwitchCheck: boolean;
  requirePositionCapCheck: boolean;
  requirePnLCheck: boolean;
}

const DEFAULT_CONFIG: PreTradeCheckConfig = {
  maxSpread: 10,           // 10 cents max spread
  maxSpreadPct: 20,        // 20% max spread
  minDepthAtTop: 10,       // 10 contracts at best
  minTotalDepth: 100,      // 100 total contracts
  maxSlippage: 2,          // 2 cents max slippage
  maxSlippagePct: 5,       // 5% max slippage
  maxOrderSize: 100,       // 100 contracts max
  maxOrderNotional: 5000,  // $50 max per order
  minPrice: 5,             // Don't trade below 5 cents
  maxPrice: 95,            // Don't trade above 95 cents
  maxCrossingTolerance: 2, // Cross up to 2 cents
  requireKillSwitchCheck: true,
  requirePositionCapCheck: true,
  requirePnLCheck: true,
};

export class PreTradeCheckService {
  private config: PreTradeCheckConfig;
  private killSwitchService?: KillSwitchService;
  private positionCapService?: PositionCapService;
  private dailyPnLService?: DailyPnLService;

  constructor(config: Partial<PreTradeCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set service dependencies
   */
  setDependencies(deps: {
    killSwitchService?: KillSwitchService;
    positionCapService?: PositionCapService;
    dailyPnLService?: DailyPnLService;
  }): void {
    this.killSwitchService = deps.killSwitchService;
    this.positionCapService = deps.positionCapService;
    this.dailyPnLService = deps.dailyPnLService;
  }

  /**
   * Run all pre-trade checks
   */
  async checkOrder(request: OrderCheckRequest): Promise<OrderCheckResult> {
    const checks: CheckResult[] = [];
    let approved = true;
    let blockingReason: string | undefined;

    // 1. Kill switch check
    if (this.config.requireKillSwitchCheck && this.killSwitchService) {
      const killCheck = await this.checkKillSwitch(request);
      checks.push(killCheck);
      if (!killCheck.passed) {
        approved = false;
        blockingReason = blockingReason || killCheck.message;
      }
    }

    // 2. Spread check
    const spreadCheck = this.checkSpread(request);
    checks.push(spreadCheck);
    if (!spreadCheck.passed) {
      approved = false;
      blockingReason = blockingReason || spreadCheck.message;
    }

    // 3. Price bounds check
    const priceCheck = this.checkPriceBounds(request);
    checks.push(priceCheck);
    if (!priceCheck.passed) {
      approved = false;
      blockingReason = blockingReason || priceCheck.message;
    }

    // 4. Order size check
    const sizeCheck = this.checkOrderSize(request);
    checks.push(sizeCheck);
    if (!sizeCheck.passed) {
      approved = false;
      blockingReason = blockingReason || sizeCheck.message;
    }

    // 5. Liquidity check
    const liquidityCheck = this.checkLiquidity(request);
    checks.push(liquidityCheck);
    if (!liquidityCheck.passed) {
      approved = false;
      blockingReason = blockingReason || liquidityCheck.message;
    }

    // 6. Slippage estimation
    const slippageResult = this.estimateSlippage(request);
    checks.push(slippageResult.check);
    if (!slippageResult.check.passed) {
      approved = false;
      blockingReason = blockingReason || slippageResult.check.message;
    }

    // 7. Position cap check
    if (this.config.requirePositionCapCheck && this.positionCapService) {
      const capCheck = await this.checkPositionCaps(request);
      checks.push(capCheck);
      if (!capCheck.passed) {
        approved = false;
        blockingReason = blockingReason || capCheck.message;
      }
    }

    // 8. P&L check
    if (this.config.requirePnLCheck && this.dailyPnLService) {
      const pnlCheck = await this.checkPnLStatus();
      checks.push(pnlCheck);
      if (!pnlCheck.passed) {
        approved = false;
        blockingReason = blockingReason || pnlCheck.message;
      }
    }

    // 9. Crossing tolerance check
    const crossingCheck = this.checkCrossingTolerance(request);
    checks.push(crossingCheck);
    if (!crossingCheck.passed) {
      approved = false;
      blockingReason = blockingReason || crossingCheck.message;
    }

    return {
      approved,
      checks,
      estimatedSlippage: slippageResult.slippage,
      adjustedPrice: slippageResult.adjustedPrice,
      blockingReason,
    };
  }

  /**
   * Check kill switch status
   */
  private async checkKillSwitch(request: OrderCheckRequest): Promise<CheckResult> {
    const result = await this.killSwitchService!.check({
      marketId: request.marketId,
      strategyId: request.strategyId,
    });

    return {
      name: 'Kill Switch',
      passed: !result.isBlocked,
      message: result.isBlocked
        ? `Blocked by ${result.blockingSwitch?.level} kill switch: ${result.blockingSwitch?.description || result.blockingSwitch?.reason}`
        : 'No active kill switches',
      severity: result.isBlocked ? 'error' : 'info',
    };
  }

  /**
   * Check bid-ask spread
   */
  private checkSpread(request: OrderCheckRequest): CheckResult {
    const spread = request.side === 'yes'
      ? request.yesAsk - request.yesBid
      : request.noAsk - request.noBid;

    const mid = request.side === 'yes'
      ? (request.yesAsk + request.yesBid) / 2
      : (request.noAsk + request.noBid) / 2;

    const spreadPct = (spread / mid) * 100;

    const passesAbsolute = spread <= this.config.maxSpread;
    const passesPercent = spreadPct <= this.config.maxSpreadPct;
    const passed = passesAbsolute && passesPercent;

    return {
      name: 'Spread',
      passed,
      message: passed
        ? `Spread ${spread.toFixed(1)}¢ (${spreadPct.toFixed(1)}%) within limits`
        : `Spread too wide: ${spread.toFixed(1)}¢ (${spreadPct.toFixed(1)}%) exceeds ${this.config.maxSpread}¢ / ${this.config.maxSpreadPct}%`,
      severity: passed ? 'info' : 'error',
      value: spread,
      limit: this.config.maxSpread,
    };
  }

  /**
   * Check price bounds
   */
  private checkPriceBounds(request: OrderCheckRequest): CheckResult {
    const price = request.limitPrice ?? (
      request.action === 'buy'
        ? (request.side === 'yes' ? request.yesAsk : request.noAsk)
        : (request.side === 'yes' ? request.yesBid : request.noBid)
    );

    const passed = price >= this.config.minPrice && price <= this.config.maxPrice;

    return {
      name: 'Price Bounds',
      passed,
      message: passed
        ? `Price ${price}¢ within bounds [${this.config.minPrice}, ${this.config.maxPrice}]`
        : `Price ${price}¢ outside bounds [${this.config.minPrice}, ${this.config.maxPrice}]`,
      severity: passed ? 'info' : 'error',
      value: price,
    };
  }

  /**
   * Check order size
   */
  private checkOrderSize(request: OrderCheckRequest): CheckResult {
    const price = request.limitPrice ?? (
      request.action === 'buy'
        ? (request.side === 'yes' ? request.yesAsk : request.noAsk)
        : (request.side === 'yes' ? request.yesBid : request.noBid)
    );

    const notional = (request.quantity * price) / 100; // Convert to dollars
    
    const passesSize = request.quantity <= this.config.maxOrderSize;
    const passesNotional = notional <= this.config.maxOrderNotional;
    const passed = passesSize && passesNotional;

    return {
      name: 'Order Size',
      passed,
      message: passed
        ? `Order size ${request.quantity} contracts ($${notional.toFixed(2)}) within limits`
        : `Order too large: ${request.quantity} contracts ($${notional.toFixed(2)}) exceeds ${this.config.maxOrderSize} / $${this.config.maxOrderNotional}`,
      severity: passed ? 'info' : 'error',
      value: request.quantity,
      limit: this.config.maxOrderSize,
    };
  }

  /**
   * Check liquidity
   */
  private checkLiquidity(request: OrderCheckRequest): CheckResult {
    // Without orderbook data, we can't check depth
    // This is a placeholder that passes if we don't have the data
    if (!request.orderbook) {
      return {
        name: 'Liquidity',
        passed: true,
        message: 'Liquidity check skipped (no orderbook data)',
        severity: 'warning',
      };
    }

    const relevantBook = request.action === 'buy' 
      ? request.orderbook.asks 
      : request.orderbook.bids;

    const topDepth = relevantBook[0]?.quantity ?? 0;
    const totalDepth = relevantBook.reduce((sum, level) => sum + level.quantity, 0);

    const passesTop = topDepth >= this.config.minDepthAtTop;
    const passesTotal = totalDepth >= this.config.minTotalDepth;
    const passed = passesTop && passesTotal;

    return {
      name: 'Liquidity',
      passed,
      message: passed
        ? `Liquidity OK: ${topDepth} at top, ${totalDepth} total`
        : `Insufficient liquidity: ${topDepth} at top (need ${this.config.minDepthAtTop}), ${totalDepth} total (need ${this.config.minTotalDepth})`,
      severity: passed ? 'info' : 'error',
      value: topDepth,
      limit: this.config.minDepthAtTop,
    };
  }

  /**
   * Estimate slippage for the order
   */
  private estimateSlippage(request: OrderCheckRequest): {
    check: CheckResult;
    slippage: number;
    adjustedPrice: number;
  } {
    // Without orderbook, use spread as slippage estimate
    const spread = request.side === 'yes'
      ? request.yesAsk - request.yesBid
      : request.noAsk - request.noBid;

    // Rough estimate: slippage is some fraction of spread for market orders
    // For large orders relative to depth, it would be higher
    let estimatedSlippage = spread * 0.5; // Half spread as baseline

    // If we have orderbook, calculate more precisely
    if (request.orderbook) {
      estimatedSlippage = this.walkTheBook(request);
    }

    const referencePrice = request.action === 'buy'
      ? (request.side === 'yes' ? request.yesAsk : request.noAsk)
      : (request.side === 'yes' ? request.yesBid : request.noBid);

    const slippagePct = (estimatedSlippage / referencePrice) * 100;
    const adjustedPrice = request.action === 'buy'
      ? referencePrice + estimatedSlippage
      : referencePrice - estimatedSlippage;

    const passed = estimatedSlippage <= this.config.maxSlippage 
      && slippagePct <= this.config.maxSlippagePct;

    return {
      check: {
        name: 'Slippage',
        passed,
        message: passed
          ? `Est. slippage ${estimatedSlippage.toFixed(2)}¢ (${slippagePct.toFixed(1)}%) within limits`
          : `Slippage too high: ${estimatedSlippage.toFixed(2)}¢ (${slippagePct.toFixed(1)}%) exceeds ${this.config.maxSlippage}¢ / ${this.config.maxSlippagePct}%`,
        severity: passed ? 'info' : 'error',
        value: estimatedSlippage,
        limit: this.config.maxSlippage,
      },
      slippage: estimatedSlippage,
      adjustedPrice,
    };
  }

  /**
   * Walk the book to estimate execution price
   */
  private walkTheBook(request: OrderCheckRequest): number {
    const book = request.orderbook!;
    const levels = request.action === 'buy' ? book.asks : book.bids;
    
    let remaining = request.quantity;
    let totalCost = 0;
    const startPrice = levels[0]?.price ?? 0;

    for (const level of levels) {
      const fillQty = Math.min(remaining, level.quantity);
      totalCost += fillQty * level.price;
      remaining -= fillQty;
      
      if (remaining <= 0) break;
    }

    // If we couldn't fill the whole order
    if (remaining > 0) {
      // Use last price + premium for unfilled
      const lastPrice = levels[levels.length - 1]?.price ?? startPrice;
      totalCost += remaining * (lastPrice + 5); // 5 cent penalty
    }

    const avgPrice = totalCost / request.quantity;
    return Math.abs(avgPrice - startPrice);
  }

  /**
   * Check position caps
   */
  private async checkPositionCaps(request: OrderCheckRequest): Promise<CheckResult> {
    const price = request.limitPrice ?? (
      request.action === 'buy'
        ? (request.side === 'yes' ? request.yesAsk : request.noAsk)
        : (request.side === 'yes' ? request.yesBid : request.noBid)
    );

    const result = await this.positionCapService!.checkCaps({
      marketId: request.marketId,
      side: request.side,
      quantity: request.quantity,
      price,
    });

    return {
      name: 'Position Caps',
      passed: result.allowed,
      message: result.allowed
        ? 'Position caps check passed'
        : `Position cap exceeded: ${result.reason}`,
      severity: result.allowed ? 'info' : 'error',
    };
  }

  /**
   * Check P&L status
   */
  private async checkPnLStatus(): Promise<CheckResult> {
    const status = await this.dailyPnLService!.getRiskStatus();

    return {
      name: 'P&L Risk',
      passed: status.isSafe,
      message: status.isSafe
        ? `P&L within limits (${(status.dailyLossUtilization * 100).toFixed(0)}% daily loss, ${(status.drawdownUtilization * 100).toFixed(0)}% drawdown)`
        : status.warnings.join('; '),
      severity: status.isSafe ? 'info' : 'error',
    };
  }

  /**
   * Check crossing tolerance
   */
  private checkCrossingTolerance(request: OrderCheckRequest): CheckResult {
    if (!request.limitPrice) {
      // Market orders always cross
      return {
        name: 'Crossing',
        passed: true,
        message: 'Market order - crossing expected',
        severity: 'info',
      };
    }

    const mid = request.side === 'yes'
      ? (request.yesAsk + request.yesBid) / 2
      : (request.noAsk + request.noBid) / 2;

    let crossing = 0;
    if (request.action === 'buy') {
      crossing = request.limitPrice - mid;
    } else {
      crossing = mid - request.limitPrice;
    }

    const passed = crossing <= this.config.maxCrossingTolerance;

    return {
      name: 'Crossing',
      passed,
      message: passed
        ? `Limit ${request.limitPrice}¢ crosses ${crossing.toFixed(1)}¢ (within ${this.config.maxCrossingTolerance}¢ tolerance)`
        : `Limit ${request.limitPrice}¢ crosses ${crossing.toFixed(1)}¢ (exceeds ${this.config.maxCrossingTolerance}¢ tolerance)`,
      severity: passed ? 'info' : 'warning',
      value: crossing,
      limit: this.config.maxCrossingTolerance,
    };
  }
}

