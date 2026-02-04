import { requirePrisma } from '@/lib/prisma';
import { ApiCredential, SecretsStorage } from '@/services/SecretsService';

function mapCredential(record: any): ApiCredential {
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    apiKey: record.apiKey,
    apiSecret: record.apiSecret ?? undefined,
    scopes: record.scopes ?? [],
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastUsedAt: record.lastUsedAt ?? undefined,
  };
}

export class PrismaSecretsStorage implements SecretsStorage {
  async get(id: string): Promise<ApiCredential | null> {
    const record = await requirePrisma().apiCredential.findUnique({ where: { id } });
    return record ? mapCredential(record) : null;
  }

  async getByProvider(provider: string): Promise<ApiCredential[]> {
    const records = await requirePrisma().apiCredential.findMany({
      where: { provider, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapCredential);
  }

  async create(credential: ApiCredential): Promise<void> {
    await requirePrisma().apiCredential.create({
      data: {
        id: credential.id,
        name: credential.name,
        provider: credential.provider,
        apiKey: credential.apiKey,
        apiSecret: credential.apiSecret ?? null,
        scopes: credential.scopes,
        isActive: credential.isActive,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
        lastUsedAt: credential.lastUsedAt ?? null,
      },
    });
  }

  async update(id: string, updates: Partial<ApiCredential>): Promise<void> {
    await requirePrisma().apiCredential.update({
      where: { id },
      data: {
        name: updates.name,
        provider: updates.provider,
        apiKey: updates.apiKey,
        apiSecret: updates.apiSecret ?? undefined,
        scopes: updates.scopes,
        isActive: updates.isActive,
        updatedAt: updates.updatedAt ?? new Date(),
        lastUsedAt: updates.lastUsedAt ?? undefined,
      },
    });
  }

  async delete(id: string): Promise<void> {
    await requirePrisma().apiCredential.delete({ where: { id } });
  }

  async list(): Promise<ApiCredential[]> {
    const records = await requirePrisma().apiCredential.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapCredential);
  }
}
