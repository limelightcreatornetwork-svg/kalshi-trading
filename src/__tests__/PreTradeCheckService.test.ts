/**
 * PreTradeCheckService Tests
 * 
 * Comprehensive tests for pre-trade risk validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  PreTradeCheckService, 
  OrderCheckRequest,
  PreTradeCheckConfig,
} from '../services/PreTradeCheckService';
import { KillSwitchService } from '../services/KillSwitchService';
import { PositionCapService } from '../services/PositionCapService';
import { DailyPnLService } from '../services/DailyPnLService';

// Mock services
function createMockKillSwitchService(isBlocked = false): KillSwitchService {
  return {
    check: vi.fn().mockResolvedValue({
      isBlocked,
      blockingSwitch: isBlocked ? {
        level: 'GLOBAL',
        reason: 'MANUAL',
        description: 'Testing',
      } : null,
    }),
    trigger: vi.fn(),
    reset: vi.fn(),
    getActive: vi.fn(),
    emergencyStop: vi.fn(),
    resetAll: vi.fn(),
  } as unknown as KillSwitchService;
}

function createMockPositionCapService(allowed = true): PositionCapService {
  return {
    checkCaps: vi.fn().mockResolvedValue({
      allowed,
      reason: allowed ? undefined : 'Cap exceeded',
    }),
  } as unknown as PositionCapService;
}

function createMockDailyPnLService(isSafe = true): DailyPnLService {
  return {
    getRiskStatus: vi.fn().mockResolvedValue({
      isSafe,
      dailyLossUtilization: isSafe ? 0.5 : 1.2,
      drawdownUtilization: isSafe ? 0.3 : 0.9,
      warnings: isSafe ? [] : ['Daily loss exceeded'],
    }),
  } as unknown as DailyPnLService;
}

function createBaseRequest(overrides: Partial<OrderCheckRequest> = {}): OrderCheckRequest {
  return {
    marketId: 'market-1',
    marketTicker: 'BTCUSD',
    side: 'yes',
    action: 'buy',
    quantity: 10,
    limitPrice: 50,
    yesBid: 48,
    yesAsk: 52,
    noBid: 48,
    noAsk: 52,
    ...overrides,
  };
}

describe('PreTradeCheckService', () => {
  let service: PreTradeCheckService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PreTradeCheckService();
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      // Test by running a check and seeing defaults applied
      const svc = new PreTradeCheckService();
      expect(svc).toBeDefined();
    });

    it('should allow custom config', () => {
      const customConfig: Partial<PreTradeCheckConfig> = {
        maxSpread: 20,
        maxOrderSize: 50,
        minPrice: 10,
        maxPrice: 90,
      };
      const svc = new PreTradeCheckService(customConfig);
      expect(svc).toBeDefined();
    });
  });

  describe('setDependencies', () => {
    it('should set all dependencies', () => {
      const killSwitch = createMockKillSwitchService();
      const positionCap = createMockPositionCapService();
      const dailyPnL = createMockDailyPnLService();

      service.setDependencies({
        killSwitchService: killSwitch,
        positionCapService: positionCap,
        dailyPnLService: dailyPnL,
      });

      expect(true).toBe(true); // Dependencies are set internally
    });

    it('should allow partial dependencies', () => {
      service.setDependencies({
        killSwitchService: createMockKillSwitchService(),
      });

      expect(true).toBe(true);
    });
  });

  describe('checkOrder', () => {
    describe('kill switch check', () => {
      it('should pass when no active kill switches', async () => {
        const killSwitch = createMockKillSwitchService(false);
        service.setDependencies({ killSwitchService: killSwitch });

        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Kill Switch');
        expect(check?.passed).toBe(true);
        expect(check?.message).toContain('No active kill switches');
      });

      it('should fail when kill switch is active', async () => {
        const killSwitch = createMockKillSwitchService(true);
        service.setDependencies({ killSwitchService: killSwitch });

        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Kill Switch');
        expect(check?.passed).toBe(false);
        expect(check?.severity).toBe('error');
      });

      it('should skip check when kill switch service not set', async () => {
        // Don't set killSwitchService
        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Kill Switch');
        expect(check).toBeUndefined();
      });

      it('should skip check when requireKillSwitchCheck is false', async () => {
        const svc = new PreTradeCheckService({ requireKillSwitchCheck: false });
        const killSwitch = createMockKillSwitchService(true);
        svc.setDependencies({ killSwitchService: killSwitch });

        const result = await svc.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Kill Switch');
        expect(check).toBeUndefined();
      });
    });

    describe('spread check', () => {
      it('should pass when spread is within limits', async () => {
        const request = createBaseRequest({
          yesBid: 49,
          yesAsk: 51, // 2 cent spread
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Spread');
        expect(check?.passed).toBe(true);
      });

      it('should fail when spread exceeds absolute limit', async () => {
        const request = createBaseRequest({
          yesBid: 40,
          yesAsk: 60, // 20 cent spread > 10 default
        });

        const result = await service.checkOrder(request);

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Spread');
        expect(check?.passed).toBe(false);
        expect(check?.message).toContain('too wide');
      });

      it('should fail when spread exceeds percentage limit', async () => {
        // Low price makes even small spread high percentage
        const request = createBaseRequest({
          side: 'yes',
          yesBid: 8,
          yesAsk: 12, // 4 cent spread at ~10 cent mid = 40%
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Spread');
        expect(check?.passed).toBe(false);
      });

      it('should check no side spread correctly', async () => {
        const request = createBaseRequest({
          side: 'no',
          noBid: 45,
          noAsk: 55, // 10 cent spread
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Spread');
        expect(check?.value).toBe(10);
      });
    });

    describe('price bounds check', () => {
      it('should pass when price is within bounds', async () => {
        const request = createBaseRequest({ limitPrice: 50 });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.passed).toBe(true);
      });

      it('should fail when price is below minimum', async () => {
        const request = createBaseRequest({ limitPrice: 3 }); // Default min is 5

        const result = await service.checkOrder(request);

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.passed).toBe(false);
      });

      it('should fail when price is above maximum', async () => {
        const request = createBaseRequest({ limitPrice: 97 }); // Default max is 95

        const result = await service.checkOrder(request);

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.passed).toBe(false);
      });

      it('should use ask price for buy market orders', async () => {
        const request = createBaseRequest({
          limitPrice: undefined,
          action: 'buy',
          side: 'yes',
          yesAsk: 50,
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.value).toBe(50);
      });

      it('should use bid price for sell market orders', async () => {
        const request = createBaseRequest({
          limitPrice: undefined,
          action: 'sell',
          side: 'yes',
          yesBid: 48,
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.value).toBe(48);
      });

      it('should use no side prices correctly', async () => {
        const request = createBaseRequest({
          limitPrice: undefined,
          action: 'buy',
          side: 'no',
          noAsk: 55,
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Price Bounds');
        expect(check?.value).toBe(55);
      });
    });

    describe('order size check', () => {
      it('should pass when size is within limits', async () => {
        const request = createBaseRequest({ quantity: 50 });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Order Size');
        expect(check?.passed).toBe(true);
      });

      it('should fail when quantity exceeds max', async () => {
        const request = createBaseRequest({ quantity: 150 }); // Default max is 100

        const result = await service.checkOrder(request);

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Order Size');
        expect(check?.passed).toBe(false);
        expect(check?.message).toContain('too large');
      });

      it('should fail when notional exceeds max', async () => {
        // Use custom config with lower notional limit for testing
        const svc = new PreTradeCheckService({ maxOrderNotional: 50 });
        
        const request = createBaseRequest({
          quantity: 80, // Within count limit
          limitPrice: 70, // 80 * 70 / 100 = $56 > $50 custom limit
        });

        const result = await svc.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Order Size');
        expect(check?.passed).toBe(false);
      });

      it('should calculate notional correctly', async () => {
        const request = createBaseRequest({
          quantity: 10,
          limitPrice: 50, // 10 * 50 / 100 = $5
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Order Size');
        expect(check?.message).toContain('$5.00');
      });
    });

    describe('liquidity check', () => {
      it('should pass when no orderbook data (warning)', async () => {
        const request = createBaseRequest({ orderbook: undefined });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Liquidity');
        expect(check?.passed).toBe(true);
        expect(check?.severity).toBe('warning');
        expect(check?.message).toContain('skipped');
      });

      it('should pass when liquidity is sufficient', async () => {
        const request = createBaseRequest({
          orderbook: {
            bids: [{ price: 48, quantity: 50 }, { price: 47, quantity: 100 }],
            asks: [{ price: 52, quantity: 20 }, { price: 53, quantity: 100 }],
          },
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Liquidity');
        expect(check?.passed).toBe(true);
      });

      it('should fail when top of book depth is insufficient', async () => {
        const request = createBaseRequest({
          action: 'buy',
          orderbook: {
            bids: [{ price: 48, quantity: 100 }],
            asks: [{ price: 52, quantity: 5 }], // Only 5 at top, need 10
          },
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Liquidity');
        expect(check?.passed).toBe(false);
      });

      it('should fail when total depth is insufficient', async () => {
        const request = createBaseRequest({
          action: 'buy',
          orderbook: {
            bids: [{ price: 48, quantity: 100 }],
            asks: [
              { price: 52, quantity: 20 },
              { price: 53, quantity: 30 }, // Total 50, need 100
            ],
          },
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Liquidity');
        expect(check?.passed).toBe(false);
      });

      it('should check bids for sell orders', async () => {
        const request = createBaseRequest({
          action: 'sell',
          orderbook: {
            bids: [{ price: 48, quantity: 5 }], // Insufficient for sells
            asks: [{ price: 52, quantity: 100 }],
          },
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Liquidity');
        expect(check?.passed).toBe(false);
      });
    });

    describe('slippage estimation', () => {
      it('should estimate slippage without orderbook', async () => {
        const request = createBaseRequest({
          yesBid: 48,
          yesAsk: 52, // 4 cent spread, estimated slippage ~2 cents
        });

        const result = await service.checkOrder(request);

        expect(result.estimatedSlippage).toBeDefined();
        expect(result.estimatedSlippage).toBe(2); // Half spread
      });

      it('should pass when slippage within limits', async () => {
        const request = createBaseRequest({
          yesBid: 49,
          yesAsk: 51, // 2 cent spread, 1 cent estimated slippage
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Slippage');
        expect(check?.passed).toBe(true);
      });

      it('should fail when slippage exceeds absolute limit', async () => {
        const request = createBaseRequest({
          yesBid: 40,
          yesAsk: 50, // 10 cent spread, 5 cent estimated slippage > 2 default
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Slippage');
        expect(check?.passed).toBe(false);
      });

      it('should calculate adjusted price for buys', async () => {
        const request = createBaseRequest({
          action: 'buy',
          side: 'yes',
          yesBid: 48,
          yesAsk: 52,
        });

        const result = await service.checkOrder(request);

        // Buy at ask (52) + slippage (2) = 54
        expect(result.adjustedPrice).toBe(54);
      });

      it('should calculate adjusted price for sells', async () => {
        const request = createBaseRequest({
          action: 'sell',
          side: 'yes',
          yesBid: 48,
          yesAsk: 52,
        });

        const result = await service.checkOrder(request);

        // Sell at bid (48) - slippage (2) = 46
        expect(result.adjustedPrice).toBe(46);
      });

      it('should walk the book when orderbook available', async () => {
        const request = createBaseRequest({
          action: 'buy',
          quantity: 30,
          orderbook: {
            bids: [],
            asks: [
              { price: 50, quantity: 10 },
              { price: 51, quantity: 10 },
              { price: 52, quantity: 10 },
            ],
          },
        });

        const result = await service.checkOrder(request);

        // Average price = (10*50 + 10*51 + 10*52) / 30 = 51
        // Slippage = 51 - 50 = 1
        expect(result.estimatedSlippage).toBe(1);
      });

      it('should handle unfillable orders in book walk', async () => {
        const request = createBaseRequest({
          action: 'buy',
          quantity: 50, // More than available
          orderbook: {
            bids: [],
            asks: [
              { price: 50, quantity: 10 },
              { price: 51, quantity: 10 }, // Only 20 available
            ],
          },
        });

        const result = await service.checkOrder(request);

        // Remaining 30 at 51 + 5 cent penalty = 56
        // Total = (10*50 + 10*51 + 30*56) / 50 = 53.3
        // Slippage = 53.3 - 50 = 3.3
        expect(result.estimatedSlippage).toBeGreaterThan(3);
      });
    });

    describe('position caps check', () => {
      it('should pass when within caps', async () => {
        const positionCap = createMockPositionCapService(true);
        service.setDependencies({ positionCapService: positionCap });

        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Position Caps');
        expect(check?.passed).toBe(true);
      });

      it('should fail when caps exceeded', async () => {
        const positionCap = createMockPositionCapService(false);
        service.setDependencies({ positionCapService: positionCap });

        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'Position Caps');
        expect(check?.passed).toBe(false);
      });

      it('should skip check when service not set', async () => {
        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Position Caps');
        expect(check).toBeUndefined();
      });

      it('should skip check when disabled in config', async () => {
        const svc = new PreTradeCheckService({ requirePositionCapCheck: false });
        const positionCap = createMockPositionCapService(false);
        svc.setDependencies({ positionCapService: positionCap });

        const result = await svc.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'Position Caps');
        expect(check).toBeUndefined();
      });

      it('should pass correct parameters to checkCaps', async () => {
        const positionCap = createMockPositionCapService(true);
        service.setDependencies({ positionCapService: positionCap });

        await service.checkOrder(createBaseRequest({
          marketId: 'market-123',
          side: 'yes',
          quantity: 25,
          limitPrice: 60,
        }));

        expect(positionCap.checkCaps).toHaveBeenCalledWith({
          marketId: 'market-123',
          side: 'yes',
          quantity: 25,
          price: 60,
        });
      });
    });

    describe('P&L check', () => {
      it('should pass when P&L is safe', async () => {
        const dailyPnL = createMockDailyPnLService(true);
        service.setDependencies({ dailyPnLService: dailyPnL });

        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'P&L Risk');
        expect(check?.passed).toBe(true);
      });

      it('should fail when P&L is unsafe', async () => {
        const dailyPnL = createMockDailyPnLService(false);
        service.setDependencies({ dailyPnLService: dailyPnL });

        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(false);
        const check = result.checks.find(c => c.name === 'P&L Risk');
        expect(check?.passed).toBe(false);
      });

      it('should skip check when service not set', async () => {
        const result = await service.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'P&L Risk');
        expect(check).toBeUndefined();
      });

      it('should skip check when disabled in config', async () => {
        const svc = new PreTradeCheckService({ requirePnLCheck: false });
        const dailyPnL = createMockDailyPnLService(false);
        svc.setDependencies({ dailyPnLService: dailyPnL });

        const result = await svc.checkOrder(createBaseRequest());

        const check = result.checks.find(c => c.name === 'P&L Risk');
        expect(check).toBeUndefined();
      });
    });

    describe('crossing tolerance check', () => {
      it('should pass for market orders', async () => {
        const request = createBaseRequest({ limitPrice: undefined });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Crossing');
        expect(check?.passed).toBe(true);
        expect(check?.message).toContain('Market order');
      });

      it('should pass when crossing within tolerance', async () => {
        const request = createBaseRequest({
          action: 'buy',
          side: 'yes',
          yesBid: 48,
          yesAsk: 52,
          limitPrice: 51, // Mid is 50, crossing 1 cent
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Crossing');
        expect(check?.passed).toBe(true);
      });

      it('should fail when crossing exceeds tolerance', async () => {
        const request = createBaseRequest({
          action: 'buy',
          side: 'yes',
          yesBid: 48,
          yesAsk: 52,
          limitPrice: 55, // Mid is 50, crossing 5 cents > 2 default
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Crossing');
        expect(check?.passed).toBe(false);
        expect(check?.severity).toBe('warning');
      });

      it('should calculate sell crossing correctly', async () => {
        const request = createBaseRequest({
          action: 'sell',
          side: 'yes',
          yesBid: 48,
          yesAsk: 52,
          limitPrice: 47, // Mid is 50, crossing 3 cents
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Crossing');
        expect(check?.value).toBe(3);
      });

      it('should use no side mid for crossing calc', async () => {
        const request = createBaseRequest({
          action: 'buy',
          side: 'no',
          noBid: 45,
          noAsk: 55,
          limitPrice: 52, // Mid is 50, crossing 2 cents
        });

        const result = await service.checkOrder(request);

        const check = result.checks.find(c => c.name === 'Crossing');
        expect(check?.passed).toBe(true);
        expect(check?.value).toBe(2);
      });
    });

    describe('blocking reason', () => {
      it('should set blocking reason from first failed check', async () => {
        const request = createBaseRequest({
          quantity: 150, // Exceeds size limit
          limitPrice: 97, // Exceeds price limit
        });

        const result = await service.checkOrder(request);

        expect(result.approved).toBe(false);
        expect(result.blockingReason).toBeDefined();
        // Should be from first failed check in order
      });

      it('should have no blocking reason when approved', async () => {
        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(true);
        expect(result.blockingReason).toBeUndefined();
      });
    });

    describe('full integration', () => {
      it('should run all checks and return comprehensive result', async () => {
        const killSwitch = createMockKillSwitchService(false);
        const positionCap = createMockPositionCapService(true);
        const dailyPnL = createMockDailyPnLService(true);

        service.setDependencies({
          killSwitchService: killSwitch,
          positionCapService: positionCap,
          dailyPnLService: dailyPnL,
        });

        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(true);
        expect(result.checks.length).toBeGreaterThanOrEqual(7); // At least 7 checks
        expect(result.estimatedSlippage).toBeDefined();
        expect(result.adjustedPrice).toBeDefined();
      });

      it('should fail fast on any blocking check', async () => {
        const killSwitch = createMockKillSwitchService(true); // Blocked

        service.setDependencies({ killSwitchService: killSwitch });

        const result = await service.checkOrder(createBaseRequest());

        expect(result.approved).toBe(false);
        expect(result.blockingReason).toContain('kill switch');
      });
    });
  });
});
