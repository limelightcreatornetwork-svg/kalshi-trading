import { requirePrisma } from '@/lib/prisma';
import {
  KillSwitch,
  KillSwitchConfig,
  KillSwitchLevel,
  KillSwitchReason,
} from '@/types/killswitch';
import { KillSwitchStorage } from '@/services/KillSwitchService';

function mapKillSwitch(record: any): KillSwitch {
  return {
    id: record.id,
    level: record.level as KillSwitchLevel,
    targetId: record.targetId ?? undefined,
    isActive: record.isActive,
    reason: record.reason as KillSwitchReason,
    description: record.description ?? undefined,
    triggeredBy: record.triggeredBy,
    triggeredAt: record.triggeredAt,
    autoResetAt: record.autoResetAt ?? undefined,
    resetBy: record.resetBy ?? undefined,
    resetAt: record.resetAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function mapKillSwitchConfig(record: any): KillSwitchConfig {
  return {
    id: record.id,
    level: record.level as KillSwitchLevel,
    targetId: record.targetId ?? undefined,
    maxDailyLoss: record.maxDailyLoss ? Number(record.maxDailyLoss) : undefined,
    maxDrawdown: record.maxDrawdown ? Number(record.maxDrawdown) : undefined,
    maxErrorRate: record.maxErrorRate ? Number(record.maxErrorRate) : undefined,
    maxLatency: record.maxLatency ?? undefined,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class PrismaKillSwitchStorage implements KillSwitchStorage {
  async getActive(): Promise<KillSwitch[]> {
    const records = await requirePrisma().killSwitch.findMany({
      where: { isActive: true },
      orderBy: { triggeredAt: 'desc' },
    });
    return records.map(mapKillSwitch);
  }

  async getByLevel(level: KillSwitchLevel): Promise<KillSwitch[]> {
    const records = await requirePrisma().killSwitch.findMany({
      where: { level },
      orderBy: { triggeredAt: 'desc' },
    });
    return records.map(mapKillSwitch);
  }

  async getById(id: string): Promise<KillSwitch | null> {
    const record = await requirePrisma().killSwitch.findUnique({ where: { id } });
    return record ? mapKillSwitch(record) : null;
  }

  async create(killSwitch: KillSwitch): Promise<void> {
    await requirePrisma().killSwitch.create({
      data: {
        id: killSwitch.id,
        level: killSwitch.level,
        targetId: killSwitch.targetId ?? null,
        isActive: killSwitch.isActive,
        reason: killSwitch.reason,
        description: killSwitch.description ?? null,
        triggeredBy: killSwitch.triggeredBy,
        triggeredAt: killSwitch.triggeredAt,
        autoResetAt: killSwitch.autoResetAt ?? null,
        resetBy: killSwitch.resetBy ?? null,
        resetAt: killSwitch.resetAt ?? null,
        createdAt: killSwitch.createdAt,
        updatedAt: killSwitch.updatedAt,
      },
    });
  }

  async update(id: string, updates: Partial<KillSwitch>): Promise<void> {
    await requirePrisma().killSwitch.update({
      where: { id },
      data: {
        level: updates.level,
        targetId: updates.targetId ?? undefined,
        isActive: updates.isActive,
        reason: updates.reason,
        description: updates.description ?? undefined,
        triggeredBy: updates.triggeredBy,
        triggeredAt: updates.triggeredAt,
        autoResetAt: updates.autoResetAt ?? undefined,
        resetBy: updates.resetBy ?? undefined,
        resetAt: updates.resetAt ?? undefined,
        updatedAt: updates.updatedAt ?? new Date(),
      },
    });
  }

  async getConfig(level: KillSwitchLevel, targetId?: string): Promise<KillSwitchConfig | null> {
    const record = await requirePrisma().killSwitchConfig.findUnique({
      where: {
        level_targetId: {
          level,
          targetId: targetId ?? '',
        },
      },
    });
    return record ? mapKillSwitchConfig(record) : null;
  }

  async setConfig(config: KillSwitchConfig): Promise<void> {
    await requirePrisma().killSwitchConfig.upsert({
      where: {
        level_targetId: {
          level: config.level,
          targetId: config.targetId ?? '',
        },
      },
      create: {
        id: config.id,
        level: config.level,
        targetId: config.targetId ?? null,
        maxDailyLoss: config.maxDailyLoss,
        maxDrawdown: config.maxDrawdown,
        maxErrorRate: config.maxErrorRate,
        maxLatency: config.maxLatency ?? null,
        isActive: config.isActive,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
      update: {
        maxDailyLoss: config.maxDailyLoss,
        maxDrawdown: config.maxDrawdown,
        maxErrorRate: config.maxErrorRate,
        maxLatency: config.maxLatency ?? null,
        isActive: config.isActive,
        updatedAt: new Date(),
      },
    });
  }
}
