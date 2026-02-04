import { KillSwitchService } from '@/services/KillSwitchService';
import { DailyPnLService } from '@/services/DailyPnLService';
import { SecretsService } from '@/services/SecretsService';
import { PrismaKillSwitchStorage } from '@/services/storage/prismaKillSwitchStorage';
import { PrismaDailyPnLStorage } from '@/services/storage/prismaDailyPnLStorage';
import { PrismaSecretsStorage } from '@/services/storage/prismaSecretsStorage';

let killSwitchService: KillSwitchService | null = null;
let dailyPnLService: DailyPnLService | null = null;
let secretsService: SecretsService | null = null;

export function getKillSwitchService(): KillSwitchService {
  if (!killSwitchService) {
    killSwitchService = new KillSwitchService(new PrismaKillSwitchStorage());
  }
  return killSwitchService;
}

export function getDailyPnLService(): DailyPnLService {
  if (!dailyPnLService) {
    dailyPnLService = new DailyPnLService(new PrismaDailyPnLStorage());
  }
  return dailyPnLService;
}

export function getSecretsService(): SecretsService {
  if (!secretsService) {
    const encryptionKey = process.env.SECRETS_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('SECRETS_ENCRYPTION_KEY not configured');
    }
    secretsService = new SecretsService(new PrismaSecretsStorage(), encryptionKey);
  }
  return secretsService;
}
