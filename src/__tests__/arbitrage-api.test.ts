import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the ArbitrageService
const mockScanForOpportunities = vi.fn();
const mockGetActiveOpportunities = vi.fn();
const mockGetScanStats = vi.fn();
const mockGetOpportunityHistory = vi.fn();
const mockExecuteOpportunity = vi.fn();
const mockCheckAlerts = vi.fn();

// Mock prisma for alert config tests
const mockAlertConfigFindFirst = vi.fn();
const mockAlertConfigUpdate = vi.fn();
const mockAlertConfigCreate = vi.fn();

vi.mock('../lib/prisma', () => ({
  requirePrisma: () => ({
    arbitrageAlertConfig: {
      findFirst: (params: any) => mockAlertConfigFindFirst(params),
      update: (params: any) => mockAlertConfigUpdate(params),
      create: (params: any) => mockAlertConfigCreate(params),
    },
  }),
}));

vi.mock('../services/ArbitrageService', () => ({
  arbitrageService: {
    scanForOpportunities: () => mockScanForOpportunities(),
    getActiveOpportunities: () => mockGetActiveOpportunities(),
    getScanStats: () => mockGetScanStats(),
    getOpportunityHistory: (params: any) => mockGetOpportunityHistory(params),
    executeOpportunity: (req: any) => mockExecuteOpportunity(req),
    checkAlerts: () => mockCheckAlerts(),
  },
}));

vi.mock('../lib/kalshi', () => ({
  KalshiApiError: class extends Error {
    statusCode: number;
    apiMessage: string;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.apiMessage = message;
    }
  },
}));

// Import route handlers after mocking
import { POST as scanPost, GET as scanGet } from '../app/api/arbitrage/scan/route';
import { GET as historyGet } from '../app/api/arbitrage/history/route';
import { POST as executePost } from '../app/api/arbitrage/execute/route';
import { GET as alertsGet, POST as alertsPost } from '../app/api/arbitrage/alerts/route';

// Helper to create mock NextRequest
function createRequest(url: string, options?: { method?: string; body?: unknown }) {
  const request = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: options?.method || 'GET',
    ...(options?.body && { body: JSON.stringify(options.body) }),
    ...(options?.body && { headers: { 'Content-Type': 'application/json' } }),
  });
  return request;
}

describe('Arbitrage API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlertConfigFindFirst.mockReset();
    mockAlertConfigUpdate.mockReset();
    mockAlertConfigCreate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // POST /api/arbitrage/scan
  // =========================================================================
  describe('POST /api/arbitrage/scan', () => {
    it('should trigger scan and return results', async () => {
      const mockScanResult = {
        scanId: 'scan-123',
        marketsScanned: 500,
        opportunitiesFound: 3,
        totalProfitPotential: 15.5,
        scanDurationMs: 2500,
        opportunities: [
          {
            id: 'opp-1',
            marketTicker: 'TEST-MKT',
            profitCents: 6,
            profitPercent: 6.38,
          },
        ],
        allMarkets: [],
      };

      mockScanForOpportunities.mockResolvedValue(mockScanResult);

      const response = await scanPost();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.scanId).toBe('scan-123');
      expect(data.data.marketsScanned).toBe(500);
      expect(data.data.opportunitiesFound).toBe(3);
    });

    it('should handle scan errors', async () => {
      mockScanForOpportunities.mockRejectedValue(new Error('Scan failed'));

      const response = await scanPost();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Scan failed');
    });

    it('should handle Kalshi API errors', async () => {
      const { KalshiApiError } = await import('../lib/kalshi');
      mockScanForOpportunities.mockRejectedValue(
        new KalshiApiError('Rate limited', 429)
      );

      const response = await scanPost();
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Rate limited');
    });
  });

  // =========================================================================
  // GET /api/arbitrage/scan
  // =========================================================================
  describe('GET /api/arbitrage/scan', () => {
    it('should return active opportunities and stats', async () => {
      const mockOpportunities = [
        {
          id: 'opp-1',
          marketTicker: 'MKT-1',
          profitCents: 8,
          status: 'ACTIVE',
        },
        {
          id: 'opp-2',
          marketTicker: 'MKT-2',
          profitCents: 5,
          status: 'ACTIVE',
        },
      ];

      const mockStats = {
        totalScans: 100,
        totalOpportunities: 50,
        avgProfitCents: 4.5,
        totalProfitPotential: 225,
        executedCount: 10,
        totalActualProfit: 45,
      };

      mockGetActiveOpportunities.mockResolvedValue(mockOpportunities);
      mockGetScanStats.mockResolvedValue(mockStats);

      const request = createRequest('http://localhost:3000/api/arbitrage/scan');
      const response = await scanGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.opportunities.length).toBe(2);
      expect(data.data.count).toBe(2);
      expect(data.data.stats.totalScans).toBe(100);
    });

    it('should include history when includeAll=true', async () => {
      mockGetActiveOpportunities.mockResolvedValue([]);
      mockGetScanStats.mockResolvedValue({
        totalScans: 0,
        totalOpportunities: 0,
        avgProfitCents: 0,
        totalProfitPotential: 0,
        executedCount: 0,
        totalActualProfit: 0,
      });
      mockGetOpportunityHistory.mockResolvedValue([
        { id: 'hist-1', status: 'EXECUTED' },
        { id: 'hist-2', status: 'EXPIRED' },
      ]);

      const request = createRequest(
        'http://localhost:3000/api/arbitrage/scan?includeAll=true'
      );
      const response = await scanGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.history).toBeDefined();
      expect(data.data.history.length).toBe(2);
      expect(mockGetOpportunityHistory).toHaveBeenCalledWith({ limit: 50 });
    });

    it('should not include history when includeAll is not true', async () => {
      mockGetActiveOpportunities.mockResolvedValue([]);
      mockGetScanStats.mockResolvedValue({});

      const request = createRequest('http://localhost:3000/api/arbitrage/scan');
      const response = await scanGet(request);
      const data = await response.json();

      expect(data.data.history).toBeUndefined();
      expect(mockGetOpportunityHistory).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockGetActiveOpportunities.mockRejectedValue(new Error('Database error'));

      const request = createRequest('http://localhost:3000/api/arbitrage/scan');
      const response = await scanGet(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database error');
    });
  });

  // =========================================================================
  // GET /api/arbitrage/history
  // =========================================================================
  describe('GET /api/arbitrage/history', () => {
    it('should return opportunity history', async () => {
      const mockHistory = [
        {
          id: 'opp-1',
          type: 'SINGLE_MARKET',
          status: 'EXECUTED',
          profitCents: 10,
        },
        {
          id: 'opp-2',
          type: 'SINGLE_MARKET',
          status: 'EXPIRED',
          profitCents: 5,
        },
      ];

      mockGetOpportunityHistory.mockResolvedValue(mockHistory);

      const request = createRequest('http://localhost:3000/api/arbitrage/history');
      const response = await historyGet(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.opportunities.length).toBe(2);
      expect(data.data.count).toBe(2);
    });

    it('should pass filter parameters', async () => {
      mockGetOpportunityHistory.mockResolvedValue([]);

      const request = createRequest(
        'http://localhost:3000/api/arbitrage/history?limit=50&type=SINGLE_MARKET&status=EXECUTED&minProfitCents=5'
      );
      await historyGet(request);

      expect(mockGetOpportunityHistory).toHaveBeenCalledWith({
        limit: 50,
        type: 'SINGLE_MARKET',
        status: 'EXECUTED',
        minProfitCents: 5,
      });
    });

    it('should use default limit when not specified', async () => {
      mockGetOpportunityHistory.mockResolvedValue([]);

      const request = createRequest('http://localhost:3000/api/arbitrage/history');
      await historyGet(request);

      expect(mockGetOpportunityHistory).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should handle optional parameters correctly', async () => {
      mockGetOpportunityHistory.mockResolvedValue([]);

      const request = createRequest(
        'http://localhost:3000/api/arbitrage/history?limit=25'
      );
      await historyGet(request);

      expect(mockGetOpportunityHistory).toHaveBeenCalledWith({
        limit: 25,
        type: undefined,
        status: undefined,
        minProfitCents: undefined,
      });
    });

    it('should handle errors', async () => {
      mockGetOpportunityHistory.mockRejectedValue(new Error('Query failed'));

      const request = createRequest('http://localhost:3000/api/arbitrage/history');
      const response = await historyGet(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Query failed');
    });
  });

  // =========================================================================
  // POST /api/arbitrage/execute
  // =========================================================================
  describe('POST /api/arbitrage/execute', () => {
    it('should execute opportunity successfully', async () => {
      const mockResult = {
        success: true,
        opportunityId: 'opp-123',
        yesOrderId: 'yes-order-456',
        noOrderId: 'no-order-789',
        yesPrice: 45,
        noPrice: 48,
        totalCost: 930,
        expectedProfit: 70,
      };

      mockExecuteOpportunity.mockResolvedValue(mockResult);

      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 10,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.yesOrderId).toBe('yes-order-456');
      expect(data.data.noOrderId).toBe('no-order-789');
      expect(data.data.totalCost).toBe(930);
    });

    it('should return error for missing opportunityId', async () => {
      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          contracts: 10,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('opportunityId is required');
    });

    it('should return error for invalid contracts', async () => {
      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 0,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('contracts must be at least 1');
    });

    it('should return error for missing contracts', async () => {
      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('contracts must be at least 1');
    });

    it('should pass maxSlippage when provided', async () => {
      mockExecuteOpportunity.mockResolvedValue({
        success: true,
        opportunityId: 'opp-123',
      });

      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 10,
          maxSlippage: 2,
        },
      });

      await executePost(request);

      expect(mockExecuteOpportunity).toHaveBeenCalledWith({
        opportunityId: 'opp-123',
        contracts: 10,
        maxSlippage: 2,
      });
    });

    it('should return error when execution fails', async () => {
      mockExecuteOpportunity.mockResolvedValue({
        success: false,
        opportunityId: 'opp-123',
        error: 'Opportunity not found',
      });

      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 10,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Opportunity not found');
    });

    it('should handle Kalshi API errors', async () => {
      const { KalshiApiError } = await import('../lib/kalshi');
      mockExecuteOpportunity.mockRejectedValue(
        new KalshiApiError('Insufficient funds', 400)
      );

      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 10,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Insufficient funds');
    });

    it('should handle unexpected errors', async () => {
      mockExecuteOpportunity.mockRejectedValue(new Error('Network timeout'));

      const request = createRequest('http://localhost:3000/api/arbitrage/execute', {
        method: 'POST',
        body: {
          opportunityId: 'opp-123',
          contracts: 10,
        },
      });

      const response = await executePost(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Network timeout');
    });
  });

  // =========================================================================
  // GET /api/arbitrage/alerts
  // =========================================================================
  describe('GET /api/arbitrage/alerts', () => {
    it('should return pending alerts', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          marketTicker: 'HIGH-PROFIT-MKT',
          profitCents: 15,
          profitPercent: 16.67,
        },
      ];

      mockCheckAlerts.mockResolvedValue(mockAlerts);

      const response = await alertsGet();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.alerts.length).toBe(1);
      expect(data.data.count).toBe(1);
    });

    it('should return empty alerts array when none', async () => {
      mockCheckAlerts.mockResolvedValue([]);

      const response = await alertsGet();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.alerts).toEqual([]);
      expect(data.data.count).toBe(0);
    });

    it('should handle errors', async () => {
      mockCheckAlerts.mockRejectedValue(new Error('Alert check failed'));

      const response = await alertsGet();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Alert check failed');
    });
  });

  // =========================================================================
  // POST /api/arbitrage/alerts - Configure alert settings
  // =========================================================================
  describe('POST /api/arbitrage/alerts', () => {
    it('should create new alert config when none exists', async () => {
      mockAlertConfigFindFirst.mockResolvedValue(null);
      mockAlertConfigCreate.mockResolvedValue({
        id: 'config-123',
        minProfitCents: 5,
        minProfitPercent: 2.5,
        alertEnabled: true,
        webhookUrl: 'https://example.com/webhook',
      });

      const request = createRequest('http://localhost:3000/api/arbitrage/alerts', {
        method: 'POST',
        body: {
          minProfitCents: 5,
          minProfitPercent: 2.5,
          alertEnabled: true,
          webhookUrl: 'https://example.com/webhook',
        },
      });

      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.minProfitCents).toBe(5);
      expect(data.data.minProfitPercent).toBe(2.5);
      expect(data.data.alertEnabled).toBe(true);
    });

    it('should update existing alert config', async () => {
      mockAlertConfigFindFirst.mockResolvedValue({
        id: 'existing-config',
        minProfitCents: 1,
        minProfitPercent: 0.5,
        alertEnabled: false,
      });
      mockAlertConfigUpdate.mockResolvedValue({
        id: 'existing-config',
        minProfitCents: 3,
        minProfitPercent: 1.5,
        alertEnabled: true,
        webhookUrl: null,
      });

      const request = createRequest('http://localhost:3000/api/arbitrage/alerts', {
        method: 'POST',
        body: {
          minProfitCents: 3,
          minProfitPercent: 1.5,
          alertEnabled: true,
        },
      });

      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.minProfitCents).toBe(3);
      expect(mockAlertConfigUpdate).toHaveBeenCalled();
    });

    it('should use default values when creating config without all fields', async () => {
      mockAlertConfigFindFirst.mockResolvedValue(null);
      mockAlertConfigCreate.mockImplementation(({ data }) => ({
        id: 'new-config',
        ...data,
      }));

      const request = createRequest('http://localhost:3000/api/arbitrage/alerts', {
        method: 'POST',
        body: {},
      });

      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockAlertConfigCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            minProfitCents: 1,
            minProfitPercent: 0.5,
            alertEnabled: true,
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      mockAlertConfigFindFirst.mockRejectedValue(new Error('Database connection failed'));

      const request = createRequest('http://localhost:3000/api/arbitrage/alerts', {
        method: 'POST',
        body: { minProfitCents: 5 },
      });

      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Database connection failed');
    });

    it('should only update provided fields', async () => {
      mockAlertConfigFindFirst.mockResolvedValue({
        id: 'existing-config',
        minProfitCents: 1,
        minProfitPercent: 0.5,
        alertEnabled: true,
        webhookUrl: 'https://old.webhook.com',
      });
      mockAlertConfigUpdate.mockImplementation(({ data }) => ({
        id: 'existing-config',
        minProfitCents: data.minProfitCents ?? 1,
        minProfitPercent: 0.5,
        alertEnabled: data.alertEnabled ?? true,
        webhookUrl: 'https://old.webhook.com',
      }));

      const request = createRequest('http://localhost:3000/api/arbitrage/alerts', {
        method: 'POST',
        body: {
          minProfitCents: 10,
          alertEnabled: false,
        },
      });

      const response = await alertsPost(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.minProfitCents).toBe(10);
      expect(data.data.alertEnabled).toBe(false);
    });
  });
});

// =========================================================================
// Integration Tests
// =========================================================================
describe('Arbitrage API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support full scan-then-execute workflow', async () => {
    // 1. Scan for opportunities
    mockScanForOpportunities.mockResolvedValue({
      scanId: 'scan-001',
      marketsScanned: 100,
      opportunitiesFound: 1,
      totalProfitPotential: 6,
      scanDurationMs: 1500,
      opportunities: [
        {
          id: 'opp-discovered',
          marketTicker: 'PROFITABLE-MKT',
          profitCents: 6,
          profitPercent: 6.38,
          status: 'ACTIVE',
        },
      ],
      allMarkets: [],
    });

    const scanResponse = await scanPost();
    const scanData = await scanResponse.json();

    expect(scanData.success).toBe(true);
    expect(scanData.data.opportunities[0].id).toBe('opp-discovered');

    // 2. Execute the opportunity
    mockExecuteOpportunity.mockResolvedValue({
      success: true,
      opportunityId: 'opp-discovered',
      yesOrderId: 'yes-123',
      noOrderId: 'no-456',
      totalCost: 940,
      expectedProfit: 60,
    });

    const executeRequest = createRequest(
      'http://localhost:3000/api/arbitrage/execute',
      {
        method: 'POST',
        body: {
          opportunityId: 'opp-discovered',
          contracts: 10,
        },
      }
    );

    const executeResponse = await executePost(executeRequest);
    const executeData = await executeResponse.json();

    expect(executeData.success).toBe(true);
    expect(executeData.data.expectedProfit).toBe(60);
  });

  it('should handle alert-driven workflow', async () => {
    // 1. Check alerts
    mockCheckAlerts.mockResolvedValue([
      {
        id: 'alert-opp-1',
        marketTicker: 'ALERT-MKT',
        profitCents: 12,
        profitPercent: 13.33,
        status: 'ACTIVE',
      },
    ]);

    const alertResponse = await alertsGet();
    const alertData = await alertResponse.json();

    expect(alertData.data.count).toBe(1);
    expect(alertData.data.alerts[0].profitCents).toBe(12);

    // 2. Execute on the alert
    mockExecuteOpportunity.mockResolvedValue({
      success: true,
      opportunityId: 'alert-opp-1',
      totalCost: 870,
      expectedProfit: 130,
    });

    const executeRequest = createRequest(
      'http://localhost:3000/api/arbitrage/execute',
      {
        method: 'POST',
        body: {
          opportunityId: 'alert-opp-1',
          contracts: 10,
        },
      }
    );

    const executeResponse = await executePost(executeRequest);
    const executeData = await executeResponse.json();

    expect(executeData.success).toBe(true);
  });

  it('should provide historical context after operations', async () => {
    // Get history to see past operations
    mockGetOpportunityHistory.mockResolvedValue([
      { id: 'past-1', status: 'EXECUTED', profitCents: 8, actualProfit: 80 },
      { id: 'past-2', status: 'MISSED', profitCents: 5 },
      { id: 'past-3', status: 'EXPIRED', profitCents: 3 },
    ]);

    const historyRequest = createRequest(
      'http://localhost:3000/api/arbitrage/history?status=EXECUTED'
    );
    const historyResponse = await historyGet(historyRequest);
    const historyData = await historyResponse.json();

    expect(historyData.success).toBe(true);
    expect(mockGetOpportunityHistory).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXECUTED' })
    );
  });
});
