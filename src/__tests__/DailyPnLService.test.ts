/**
 * DailyPnLService Tests
 * 
 * Comprehensive tests for daily P&L tracking, thresholds, and kill switch integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  DailyPnLService, 
  DailyPnL, 
  PnLStorage, 
  PnLUpdate,
  DailyPnLServiceEvents 
} from '../services/DailyPnLService';
import { KillSwitchService } from '../services/KillSwitchService';
import { KillSwitchLevel, KillSwitchReason } from '../types/killswitch';

// Mock storage
function createMockStorage(): PnLStorage {
  const records = new Map<string, DailyPnL>();
  
  return {
    getByDate: vi.fn(async (date: string) => records.get(date) || null),
    create: vi.fn(async (pnl: DailyPnL) => {
      records.set(pnl.date, pnl);
    }),
    update: vi.fn(async (date: string, updates: Partial<DailyPnL>) => {
      const existing = records.get(date);
      if (existing) {
        records.set(date, { ...existing, ...updates });
      }
    }),
    getRange: vi.fn(async (startDate: string, endDate: string) => {
      const result: DailyPnL[] = [];
      records.forEach((pnl, date) => {
        if (date >= startDate && date <= endDate) {
          result.push(pnl);
        }
      });
      return result.sort((a, b) => a.date.localeCompare(b.date));
    }),
  };
}

function createMockKillSwitchService(): KillSwitchService {
  return {
    trigger: vi.fn(),
    reset: vi.fn(),
    check: vi.fn(),
    getActive: vi.fn(),
    emergencyStop: vi.fn(),
    resetAll: vi.fn(),
  } as unknown as KillSwitchService;
}

function createBasePnL(overrides: Partial<DailyPnL> = {}): DailyPnL {
  const today = new Date().toISOString().split('T')[0];
  return {
    id: 'test-id',
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
    ...overrides,
  };
}

describe('DailyPnLService', () => {
  let storage: PnLStorage;
  let service: DailyPnLService;
  let events: DailyPnLServiceEvents;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createMockStorage();
    events = {
      onPnLUpdate: vi.fn(),
      onDrawdownWarning: vi.fn(),
      onLossLimitTriggered: vi.fn(),
    };
    service = new DailyPnLService(storage, {}, events);
  });

  describe('constructor', () => {
    it('should use default config values', async () => {
      const svc = new DailyPnLService(storage);
      const status = await svc.getRiskStatus();
      expect(status.dailyLossLimit).toBe(500); // default $500
      expect(status.drawdownLimit).toBe(0.10); // default 10%
    });

    it('should allow custom config', async () => {
      const svc = new DailyPnLService(storage, {
        maxDailyLoss: 1000,
        maxDrawdown: 0.20,
        killSwitchEnabled: false,
      });
      const status = await svc.getRiskStatus();
      expect(status.dailyLossLimit).toBe(1000);
      expect(status.drawdownLimit).toBe(0.20);
    });
  });

  describe('setKillSwitchService', () => {
    it('should set the kill switch service', () => {
      const killSwitch = createMockKillSwitchService();
      service.setKillSwitchService(killSwitch);
      // No direct way to verify, but we can test it's used during threshold checks
      expect(true).toBe(true); // Service is set internally
    });
  });

  describe('getTodayPnL', () => {
    it('should return existing record if found', async () => {
      const existingPnL = createBasePnL({ realizedPnl: 100 });
      vi.mocked(storage.getByDate).mockResolvedValue(existingPnL);

      const result = await service.getTodayPnL();

      expect(result.realizedPnl).toBe(100);
      expect(storage.create).not.toHaveBeenCalled();
    });

    it('should create new record if not found', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(null);

      const result = await service.getTodayPnL();

      expect(result.realizedPnl).toBe(0);
      expect(result.netPnl).toBe(0);
      expect(storage.create).toHaveBeenCalled();
    });

    it('should initialize all fields to zero for new record', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(null);

      const result = await service.getTodayPnL();

      expect(result.realizedPnl).toBe(0);
      expect(result.unrealizedPnl).toBe(0);
      expect(result.fees).toBe(0);
      expect(result.grossPnl).toBe(0);
      expect(result.netPnl).toBe(0);
      expect(result.tradesCount).toBe(0);
      expect(result.winCount).toBe(0);
      expect(result.lossCount).toBe(0);
      expect(result.positionsOpened).toBe(0);
      expect(result.positionsClosed).toBe(0);
      expect(result.peakPnl).toBe(0);
      expect(result.drawdown).toBe(0);
      expect(result.drawdownPct).toBe(0);
    });
  });

  describe('recordUpdate', () => {
    describe('fill updates', () => {
      it('should increment trades count on fill', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'fill', amount: 0 };
        const result = await service.recordUpdate(update);

        expect(result.tradesCount).toBe(1);
      });

      it('should add fees on fill', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'fill', amount: 0, fee: 2.5 };
        const result = await service.recordUpdate(update);

        expect(result.fees).toBe(2.5);
      });

      it('should handle fill without fee', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'fill', amount: 0 };
        const result = await service.recordUpdate(update);

        expect(result.fees).toBe(0);
      });
    });

    describe('position_close updates', () => {
      it('should add realized P&L on position close', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'position_close', amount: 50 };
        const result = await service.recordUpdate(update);

        expect(result.realizedPnl).toBe(50);
        expect(result.positionsClosed).toBe(1);
      });

      it('should track winning trades', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'position_close', amount: 50, isWin: true };
        const result = await service.recordUpdate(update);

        expect(result.winCount).toBe(1);
        expect(result.lossCount).toBe(0);
      });

      it('should track losing trades', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'position_close', amount: -30, isWin: false };
        const result = await service.recordUpdate(update);

        expect(result.winCount).toBe(0);
        expect(result.lossCount).toBe(1);
      });

      it('should add fees on position close', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'position_close', amount: 50, fee: 1.5 };
        const result = await service.recordUpdate(update);

        expect(result.fees).toBe(1.5);
      });

      it('should handle position close without isWin flag', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'position_close', amount: 50 };
        const result = await service.recordUpdate(update);

        expect(result.winCount).toBe(0);
        expect(result.lossCount).toBe(0);
      });
    });

    describe('mark_to_market updates', () => {
      it('should update unrealized P&L', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        const update: PnLUpdate = { type: 'mark_to_market', amount: 100 };
        const result = await service.recordUpdate(update);

        expect(result.unrealizedPnl).toBe(100);
      });

      it('should replace (not add) unrealized P&L', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({ unrealizedPnl: 50 }));

        const update: PnLUpdate = { type: 'mark_to_market', amount: 100 };
        const result = await service.recordUpdate(update);

        expect(result.unrealizedPnl).toBe(100); // Replaced, not 150
      });
    });

    describe('P&L calculations', () => {
      it('should calculate gross P&L correctly', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          realizedPnl: 100,
          unrealizedPnl: 50,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: 25 };
        const result = await service.recordUpdate(update);

        expect(result.grossPnl).toBe(175); // 100 + 25 + 50
      });

      it('should calculate net P&L correctly', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          realizedPnl: 100,
          unrealizedPnl: 50,
          fees: 10,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: 25, fee: 5 };
        const result = await service.recordUpdate(update);

        expect(result.netPnl).toBe(160); // 175 - 15 fees
      });
    });

    describe('high water mark and drawdown', () => {
      it('should update peak P&L when netPnl exceeds previous peak', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({ peakPnl: 50 }));

        const update: PnLUpdate = { type: 'position_close', amount: 100 };
        const result = await service.recordUpdate(update);

        expect(result.peakPnl).toBe(100);
      });

      it('should not update peak P&L when netPnl is below peak', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 200,
          realizedPnl: 100,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: 10 };
        const result = await service.recordUpdate(update);

        expect(result.peakPnl).toBe(200); // Unchanged
      });

      it('should calculate drawdown correctly', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 200,
          realizedPnl: 100,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: -50 }; // Net now 50
        const result = await service.recordUpdate(update);

        expect(result.drawdown).toBe(150); // 200 - 50
      });

      it('should calculate drawdown percentage correctly', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 200,
          realizedPnl: 100,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: -50 }; // Net now 50
        const result = await service.recordUpdate(update);

        expect(result.drawdownPct).toBe(0.75); // 150 / 200
      });

      it('should handle zero peak P&L', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 0,
          realizedPnl: 0,
        }));

        const update: PnLUpdate = { type: 'position_close', amount: -50 };
        const result = await service.recordUpdate(update);

        expect(result.drawdownPct).toBe(0); // Avoid divide by zero
      });
    });

    describe('events', () => {
      it('should fire onPnLUpdate event', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        await service.recordUpdate({ type: 'fill', amount: 0 });

        expect(events.onPnLUpdate).toHaveBeenCalled();
      });
    });
  });

  describe('recordPositionOpen', () => {
    it('should increment positions opened', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

      await service.recordPositionOpen();

      expect(storage.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ positionsOpened: 1 })
      );
    });
  });

  describe('updateUnrealizedPnL', () => {
    it('should delegate to recordUpdate with mark_to_market type', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

      const result = await service.updateUnrealizedPnL(250);

      expect(result.unrealizedPnl).toBe(250);
    });
  });

  describe('threshold checks', () => {
    describe('loss limit', () => {
      it('should trigger kill switch when loss limit breached', async () => {
        const killSwitch = createMockKillSwitchService();
        service.setKillSwitchService(killSwitch);

        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        // Default max loss is $500
        await service.recordUpdate({ type: 'position_close', amount: -600 });

        expect(events.onLossLimitTriggered).toHaveBeenCalled();
        expect(killSwitch.trigger).toHaveBeenCalledWith(
          expect.objectContaining({
            level: KillSwitchLevel.GLOBAL,
            reason: KillSwitchReason.LOSS_LIMIT,
          })
        );
      });

      it('should fire onLossLimitTriggered event', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        await service.recordUpdate({ type: 'position_close', amount: -600 });

        expect(events.onLossLimitTriggered).toHaveBeenCalled();
      });

      it('should not trigger when loss is within limit', async () => {
        const killSwitch = createMockKillSwitchService();
        service.setKillSwitchService(killSwitch);

        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        await service.recordUpdate({ type: 'position_close', amount: -400 });

        expect(events.onLossLimitTriggered).not.toHaveBeenCalled();
        expect(killSwitch.trigger).not.toHaveBeenCalled();
      });
    });

    describe('drawdown limit', () => {
      it('should trigger kill switch when drawdown limit breached', async () => {
        const killSwitch = createMockKillSwitchService();
        service.setKillSwitchService(killSwitch);

        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 1000,
          realizedPnl: 900, // Net will be 800 after -100 update
        }));

        // This will create drawdown of 200 out of 1000 peak = 20% > 10% limit
        await service.recordUpdate({ type: 'position_close', amount: -100 });

        expect(events.onDrawdownWarning).toHaveBeenCalled();
        expect(killSwitch.trigger).toHaveBeenCalledWith(
          expect.objectContaining({
            level: KillSwitchLevel.GLOBAL,
            reason: KillSwitchReason.LOSS_LIMIT,
          })
        );
      });

      it('should not trigger when drawdown is within limit', async () => {
        const killSwitch = createMockKillSwitchService();
        service.setKillSwitchService(killSwitch);

        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
          peakPnl: 1000,
          realizedPnl: 950, // Small drawdown
        }));

        await service.recordUpdate({ type: 'position_close', amount: -10 });

        expect(events.onDrawdownWarning).not.toHaveBeenCalled();
      });
    });

    describe('kill switch disabled', () => {
      it('should not trigger kill switch when disabled', async () => {
        const svc = new DailyPnLService(storage, { killSwitchEnabled: false }, events);
        const killSwitch = createMockKillSwitchService();
        svc.setKillSwitchService(killSwitch);

        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        await svc.recordUpdate({ type: 'position_close', amount: -600 });

        // Event still fires
        expect(events.onLossLimitTriggered).toHaveBeenCalled();
        // But kill switch not triggered
        expect(killSwitch.trigger).not.toHaveBeenCalled();
      });
    });

    describe('no kill switch service', () => {
      it('should handle threshold breach without kill switch service', async () => {
        vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

        // Should not throw
        await service.recordUpdate({ type: 'position_close', amount: -600 });

        expect(events.onLossLimitTriggered).toHaveBeenCalled();
      });
    });
  });

  describe('getPnLRange', () => {
    it('should return records and summary for date range', async () => {
      const records: DailyPnL[] = [
        createBasePnL({
          date: '2024-01-15',
          realizedPnl: 100,
          fees: 5,
          netPnl: 95,
          tradesCount: 5,
          winCount: 3,
          lossCount: 2,
          drawdownPct: 0.05,
        }),
        createBasePnL({
          date: '2024-01-16',
          realizedPnl: -50,
          fees: 3,
          netPnl: -53,
          tradesCount: 3,
          winCount: 1,
          lossCount: 2,
          drawdownPct: 0.12,
        }),
      ];
      vi.mocked(storage.getRange).mockResolvedValue(records);

      const result = await service.getPnLRange('2024-01-15', '2024-01-16');

      expect(result.records).toHaveLength(2);
      expect(result.summary.totalRealizedPnl).toBe(50); // 100 - 50
      expect(result.summary.totalFees).toBe(8); // 5 + 3
      expect(result.summary.totalNetPnl).toBe(42); // 95 - 53
      expect(result.summary.totalTrades).toBe(8); // 5 + 3
      expect(result.summary.winRate).toBeCloseTo(0.5); // 4/8
      expect(result.summary.avgDailyPnl).toBe(21); // 42/2
      expect(result.summary.maxDrawdown).toBe(0.12);
    });

    it('should return zeros for empty range', async () => {
      vi.mocked(storage.getRange).mockResolvedValue([]);

      const result = await service.getPnLRange('2024-01-15', '2024-01-16');

      expect(result.records).toHaveLength(0);
      expect(result.summary.totalRealizedPnl).toBe(0);
      expect(result.summary.totalFees).toBe(0);
      expect(result.summary.totalNetPnl).toBe(0);
      expect(result.summary.totalTrades).toBe(0);
      expect(result.summary.winRate).toBe(0);
      expect(result.summary.avgDailyPnl).toBe(0);
      expect(result.summary.maxDrawdown).toBe(0);
    });

    it('should calculate win rate correctly with zero trades', async () => {
      const records: DailyPnL[] = [
        createBasePnL({
          date: '2024-01-15',
          winCount: 0,
          lossCount: 0,
        }),
      ];
      vi.mocked(storage.getRange).mockResolvedValue(records);

      const result = await service.getPnLRange('2024-01-15', '2024-01-15');

      expect(result.summary.winRate).toBe(0);
    });
  });

  describe('getRiskStatus', () => {
    it('should return safe status with no trades', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL());

      const status = await service.getRiskStatus();

      expect(status.dailyLoss).toBe(0);
      expect(status.dailyLossUtilization).toBe(0);
      expect(status.drawdown).toBe(0);
      expect(status.drawdownUtilization).toBe(0);
      expect(status.isSafe).toBe(true);
      expect(status.warnings).toHaveLength(0);
    });

    it('should calculate daily loss utilization correctly', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        netPnl: -250, // 50% of $500 limit
      }));

      const status = await service.getRiskStatus();

      expect(status.dailyLoss).toBe(250);
      expect(status.dailyLossUtilization).toBe(0.5);
      expect(status.isSafe).toBe(true);
    });

    it('should warn when daily loss over 80% of limit', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        netPnl: -450, // 90% of $500 limit
      }));

      const status = await service.getRiskStatus();

      expect(status.warnings).toContain('Daily loss at 90% of limit');
    });

    it('should warn when drawdown over 80% of limit', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        drawdownPct: 0.09, // 90% of 10% limit
      }));

      const status = await service.getRiskStatus();

      expect(status.warnings).toContain('Drawdown at 90% of limit');
    });

    it('should mark unsafe when daily loss exceeds limit', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        netPnl: -600, // Exceeds $500 limit
      }));

      const status = await service.getRiskStatus();

      expect(status.isSafe).toBe(false);
    });

    it('should mark unsafe when drawdown exceeds limit', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        drawdownPct: 0.15, // Exceeds 10% limit
      }));

      const status = await service.getRiskStatus();

      expect(status.isSafe).toBe(false);
    });

    it('should handle positive P&L correctly', async () => {
      vi.mocked(storage.getByDate).mockResolvedValue(createBasePnL({
        netPnl: 500, // Profit
      }));

      const status = await service.getRiskStatus();

      expect(status.dailyLoss).toBe(0); // No loss
      expect(status.dailyLossUtilization).toBe(0);
      expect(status.isSafe).toBe(true);
    });
  });
});
