// Strategy API Route Tests
// Tests for /api/strategies CRUD endpoints

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Mock service-factories to return a fresh service each test
vi.mock('../lib/service-factories', async () => {
  const {
    StrategyManagementService,
    InMemoryStrategyConfigStorage,
    InMemoryStrategyStateStorage,
  } = await import('../services/StrategyManagementService');

  let service: InstanceType<typeof StrategyManagementService> | null = null;

  return {
    getStrategyManagementService: () => {
      if (!service) {
        service = new StrategyManagementService(
          new InMemoryStrategyConfigStorage(),
          new InMemoryStrategyStateStorage()
        );
      }
      return service;
    },
    __resetService: () => { service = null; },
  };
});

import { GET, POST, PATCH, DELETE } from '../app/api/strategies/route';
import { getStrategyManagementService, __resetService } from '../lib/service-factories';

function createRequest(url: string, options?: { method?: string; body?: unknown }) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options?.method || 'GET',
    ...(options?.body && { body: JSON.stringify(options.body) }),
    ...(options?.body && { headers: { 'Content-Type': 'application/json' } }),
  });
}

describe('Strategies API', () => {
  beforeEach(() => {
    ((__resetService as unknown) as () => void)();
  });

  // ─── GET /api/strategies ──────────────────────────────────────

  describe('GET /api/strategies', () => {
    it('should return empty list initially', async () => {
      const request = createRequest('http://localhost:3000/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.strategies).toEqual([]);
      expect(data.data.count).toBe(0);
      expect(data.data.summary.total).toBe(0);
    });

    it('should return created strategies', async () => {
      const service = getStrategyManagementService();
      await service.createStrategy({ name: 'Test', type: 'VALUE' as any });

      const request = createRequest('http://localhost:3000/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.strategies).toHaveLength(1);
      expect(data.data.strategies[0].name).toBe('Test');
      expect(data.data.strategies[0].type).toBe('VALUE');
    });

    it('should filter by type', async () => {
      const service = getStrategyManagementService();
      await service.createStrategy({ name: 'Val', type: 'VALUE' as any });
      await service.createStrategy({ name: 'News', type: 'NEWS' as any });

      const request = createRequest('http://localhost:3000/api/strategies?type=VALUE');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.strategies).toHaveLength(1);
      expect(data.data.strategies[0].type).toBe('VALUE');
    });

    it('should filter by enabled', async () => {
      const service = getStrategyManagementService();
      await service.createStrategy({ name: 'On', type: 'VALUE' as any, enabled: true });
      await service.createStrategy({ name: 'Off', type: 'VALUE' as any });

      const request = createRequest('http://localhost:3000/api/strategies?enabled=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.strategies).toHaveLength(1);
      expect(data.data.strategies[0].name).toBe('On');
    });
  });

  // ─── POST /api/strategies ─────────────────────────────────────

  describe('POST /api/strategies', () => {
    it('should create a strategy', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'New Strategy', type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Strategy');
      expect(data.data.type).toBe('VALUE');
      expect(data.data.id).toBeDefined();
      expect(data.data.enabled).toBe(false);
    });

    it('should create with custom settings', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: {
          name: 'Custom',
          type: 'ARBITRAGE',
          minEdge: 5,
          minConfidence: 0.8,
          autoExecute: true,
        },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.data.type).toBe('ARBITRAGE');
      expect(data.data.minEdge).toBe(5);
      expect(data.data.minConfidence).toBe(0.8);
      expect(data.data.autoExecute).toBe(true);
    });

    it('should return 400 for missing name', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('name');
    });

    it('should return 400 for missing type', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('type');
    });

    it('should return 400 for invalid type', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test', type: 'INVALID' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid type');
    });
  });

  // ─── PATCH /api/strategies ────────────────────────────────────

  describe('PATCH /api/strategies', () => {
    it('should update a strategy', async () => {
      const service = getStrategyManagementService();
      const created = await service.createStrategy({ name: 'Test', type: 'VALUE' as any });

      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'PATCH',
        body: { id: created.config.id, name: 'Updated', minEdge: 5 },
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.name).toBe('Updated');
      expect(data.data.minEdge).toBe(5);
    });

    it('should toggle enabled', async () => {
      const service = getStrategyManagementService();
      const created = await service.createStrategy({ name: 'Test', type: 'VALUE' as any });

      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'PATCH',
        body: { id: created.config.id, enabled: true },
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(data.data.enabled).toBe(true);
    });

    it('should return 400 for missing id', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'PATCH',
        body: { name: 'Updated' },
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('id');
    });

    it('should return 404 for non-existent id', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'PATCH',
        body: { id: 'nonexistent', name: 'Updated' },
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  // ─── DELETE /api/strategies ───────────────────────────────────

  describe('DELETE /api/strategies', () => {
    it('should delete a strategy', async () => {
      const service = getStrategyManagementService();
      const created = await service.createStrategy({ name: 'Test', type: 'VALUE' as any });

      const request = createRequest(`http://localhost:3000/api/strategies?id=${created.config.id}`, {
        method: 'DELETE',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.deleted).toBe(true);
    });

    it('should return 400 for missing id', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'DELETE',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('id');
    });

    it('should return 404 for non-existent id', async () => {
      const request = createRequest('http://localhost:3000/api/strategies?id=nonexistent', {
        method: 'DELETE',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
    });
  });

  // ─── Error Handling ──────────────────────────────────────────

  describe('error handling', () => {
    it('GET should return 500 on service error', async () => {
      const service = getStrategyManagementService();
      vi.spyOn(service, 'listStrategies').mockRejectedValueOnce(new Error('DB connection failed'));

      const request = createRequest('http://localhost:3000/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('DB connection failed');
    });

    it('POST should return 500 on service error', async () => {
      const service = getStrategyManagementService();
      vi.spyOn(service, 'createStrategy').mockRejectedValueOnce(new Error('Storage write failed'));

      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test', type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Storage write failed');
    });

    it('PATCH should return 500 on service error', async () => {
      const service = getStrategyManagementService();
      const created = await service.createStrategy({ name: 'Test', type: 'VALUE' as any });
      vi.spyOn(service, 'updateStrategy').mockRejectedValueOnce(new Error('Update conflict'));

      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'PATCH',
        body: { id: created.config.id, name: 'Updated' },
      });
      const response = await PATCH(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Update conflict');
    });

    it('DELETE should return 500 when deleteStrategy throws', async () => {
      const service = getStrategyManagementService();
      const created = await service.createStrategy({ name: 'Test', type: 'VALUE' as any, enabled: true });
      // Update state to ACTIVE so deleteStrategy will throw
      await service.updateState(created.config.id, { status: 'ACTIVE' as any });

      const request = createRequest(`http://localhost:3000/api/strategies?id=${created.config.id}`, {
        method: 'DELETE',
      });
      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('active strategy');
    });

    it('POST should handle non-Error throws with fallback message', async () => {
      const service = getStrategyManagementService();
      vi.spyOn(service, 'createStrategy').mockRejectedValueOnce('raw string error');

      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test', type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create strategy');
    });
  });

  // ─── GET Filter Edge Cases ─────────────────────────────────────

  describe('GET filter edge cases', () => {
    it('should filter by enabled=false', async () => {
      const service = getStrategyManagementService();
      await service.createStrategy({ name: 'Enabled', type: 'VALUE' as any, enabled: true });
      await service.createStrategy({ name: 'Disabled', type: 'VALUE' as any, enabled: false });

      const request = createRequest('http://localhost:3000/api/strategies?enabled=false');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.strategies).toHaveLength(1);
      expect(data.data.strategies[0].name).toBe('Disabled');
    });

    it('should ignore invalid type param', async () => {
      const service = getStrategyManagementService();
      await service.createStrategy({ name: 'Test', type: 'VALUE' as any });

      const request = createRequest('http://localhost:3000/api/strategies?type=INVALID');
      const response = await GET(request);
      const data = await response.json();

      // Invalid type ignored, returns all strategies
      expect(data.data.strategies).toHaveLength(1);
    });
  });

  // ─── Response Format ──────────────────────────────────────────

  describe('response format', () => {
    it('should include state with PnL dollars', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test', type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.data.state).toBeDefined();
      expect(data.data.state.pnlTodayDollars).toBe('0.00');
      expect(data.data.state.signalsGenerated).toBe(0);
      expect(data.data.state.tradesExecuted).toBe(0);
      expect(data.data.state.errorCount).toBe(0);
    });

    it('should include timestamps as ISO strings', async () => {
      const request = createRequest('http://localhost:3000/api/strategies', {
        method: 'POST',
        body: { name: 'Test', type: 'VALUE' },
      });
      const response = await POST(request);
      const data = await response.json();

      expect(data.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(data.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include summary in GET response', async () => {
      const request = createRequest('http://localhost:3000/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.summary).toBeDefined();
      expect(data.data.summary.total).toBe(0);
      expect(data.data.summary.byType).toBeDefined();
      expect(data.data.summary.byStatus).toBeDefined();
    });
  });
});
