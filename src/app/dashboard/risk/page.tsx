'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Stat, StatGrid } from '@/components/ui/stat';
import { apiFetch } from '@/lib/client-api';

interface RiskData {
  isSafe: boolean;
  killSwitch: {
    enabled: boolean;
    status: string;
    triggeredAt: string | null;
    reason: string | null;
  };
  exposure: {
    total: number;
    byCategory: Array<{
      category: string;
      amount: number;
      percentage: number;
    }>;
  };
  positionLimits: Array<{
    ticker: string;
    current: number;
    max: number;
    utilization: number;
  }>;
  margin: {
    used: number;
    available: number;
    total: number;
    utilization: number;
  };
  pnl: {
    realized: number;
    unrealized: number;
    dailyLimit: number;
    dailyUsed: number;
    dailyUtilization: number;
  };
  limits: {
    maxDailyLoss: number;
    maxDrawdown: number;
    maxPositionSize: number;
    maxExposure: number;
  };
  warnings: string[];
  lastUpdated: string;
  error?: string;
}

export default function RiskDashboard() {
  const [data, setData] = useState<RiskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [killSwitchEnabled, setKillSwitchEnabled] = useState(true);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/dashboard/risk');
      const json = await res.json();
      setData(json);
      setKillSwitchEnabled(json.killSwitch?.enabled ?? true);
    } catch (error) {
      console.error('Failed to fetch risk data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleKillSwitchToggle = async (checked: boolean) => {
    setToggleLoading(true);
    setToggleError(null);
    try {
      const res = await apiFetch('/api/dashboard/killswitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: checked ? 'enable' : 'disable' }),
      });
      const json = await res.json();
      if (json.success) {
        setKillSwitchEnabled(json.killSwitch?.enabled ?? checked);
        await fetchData();
      } else {
        setToggleError(json.error || 'Failed to update kill switch');
      }
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Failed to update kill switch');
    } finally {
      setToggleLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center text-zinc-400 py-12">
        Failed to load risk data
      </div>
    );
  }

  const getUtilizationVariant = (util: number) => {
    if (util >= 90) return 'danger';
    if (util >= 70) return 'warning';
    return 'success';
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div
        className={`p-4 rounded-xl border ${
          data.isSafe
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{data.isSafe ? '✅' : '⚠️'}</span>
            <div>
              <h2 className="text-xl font-bold text-white">
                {data.isSafe ? 'All Systems Nominal' : 'Attention Required'}
              </h2>
              <p className="text-sm text-zinc-400">
                {data.warnings.length > 0
                  ? data.warnings.join(' • ')
                  : 'All risk metrics within acceptable limits'}
              </p>
            </div>
          </div>
          <Badge variant={data.isSafe ? 'success' : 'danger'}>
            {data.isSafe ? 'SAFE' : 'WARNING'}
          </Badge>
        </div>
      </div>

      {toggleError && (
        <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
          ⚠️ {toggleError}
        </div>
      )}

      {/* Quick Stats */}
      <StatGrid>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Total Exposure"
              value={`$${data.exposure.total.toFixed(2)}`}
              trend={data.exposure.total > data.limits.maxExposure * 0.8 ? 'down' : 'up'}
              trendValue={`${((data.exposure.total / data.limits.maxExposure) * 100).toFixed(0)}% of limit`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Margin Utilization"
              value={`${data.margin.utilization.toFixed(0)}%`}
              trend={data.margin.utilization > 70 ? 'down' : 'neutral'}
              trendValue={`$${data.margin.available.toFixed(2)} available`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Realized P&L"
              value={`$${data.pnl.realized >= 0 ? '+' : ''}${data.pnl.realized.toFixed(2)}`}
              trend={data.pnl.realized >= 0 ? 'up' : 'down'}
              trendValue={`${data.pnl.dailyUtilization.toFixed(0)}% of daily limit`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Active Positions"
              value={data.positionLimits.length.toString()}
              trend="neutral"
              trendValue="markets"
            />
          </CardContent>
        </Card>
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kill Switch Control */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>🛡️ Kill Switch</CardTitle>
                <CardDescription>Emergency trading halt control</CardDescription>
              </div>
              <Switch
                checked={killSwitchEnabled}
                onCheckedChange={handleKillSwitchToggle}
                disabled={toggleLoading}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <span className="text-sm text-zinc-400">Status</span>
                <Badge variant={killSwitchEnabled ? 'success' : 'danger'}>
                  {killSwitchEnabled ? 'ARMED' : 'DISABLED'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <span className="text-sm text-zinc-400">Auto-trigger on</span>
                <span className="text-sm text-white">
                  Loss &gt; ${data.limits.maxDailyLoss}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <span className="text-sm text-zinc-400">Drawdown limit</span>
                <span className="text-sm text-white">{data.limits.maxDrawdown}%</span>
              </div>
              {data.killSwitch.triggeredAt && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">
                    ⚠️ Last triggered: {new Date(data.killSwitch.triggeredAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Reason: {data.killSwitch.reason}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exposure by Category */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Exposure by Category</CardTitle>
            <CardDescription>Current market exposure breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.exposure.byCategory.length > 0 ? (
                data.exposure.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-medium">{cat.category}</span>
                      <span className="text-zinc-400">
                        ${cat.amount.toFixed(2)} ({cat.percentage.toFixed(0)}%)
                      </span>
                    </div>
                    <Progress
                      value={cat.percentage}
                      variant={cat.percentage > 50 ? 'warning' : 'default'}
                    />
                  </div>
                ))
              ) : (
                <p className="text-zinc-400 text-sm text-center py-4">
                  No active positions
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Margin Utilization */}
        <Card>
          <CardHeader>
            <CardTitle>💰 Margin Status</CardTitle>
            <CardDescription>Account margin utilization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Used</span>
                  <span className="text-white">${data.margin.used.toFixed(2)}</span>
                </div>
                <Progress
                  value={data.margin.utilization}
                  variant={getUtilizationVariant(data.margin.utilization)}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-400 mb-1">Available</p>
                  <p className="text-lg font-bold text-green-400">
                    ${data.margin.available.toFixed(2)}
                  </p>
                </div>
                <div className="p-3 bg-zinc-800/50 rounded-lg">
                  <p className="text-xs text-zinc-400 mb-1">Total Value</p>
                  <p className="text-lg font-bold text-white">
                    ${data.margin.total.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Position Limits */}
        <Card>
          <CardHeader>
            <CardTitle>📏 Position Limits</CardTitle>
            <CardDescription>Current vs max position sizes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {data.positionLimits.length > 0 ? (
                data.positionLimits.map((pos) => (
                  <div key={pos.ticker} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-mono">{pos.ticker}</span>
                      <span className="text-zinc-400">
                        {pos.current} / {pos.max}
                      </span>
                    </div>
                    <Progress
                      value={pos.utilization}
                      variant={getUtilizationVariant(pos.utilization)}
                    />
                  </div>
                ))
              ) : (
                <p className="text-zinc-400 text-sm text-center py-4">
                  No active positions
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Limits Table */}
      <Card>
        <CardHeader>
          <CardTitle>⚙️ Risk Configuration</CardTitle>
          <CardDescription>Current risk limits and thresholds</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Max Daily Loss</p>
              <p className="text-xl font-bold text-white">${data.limits.maxDailyLoss}</p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Max Drawdown</p>
              <p className="text-xl font-bold text-white">{data.limits.maxDrawdown}%</p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Max Position Size</p>
              <p className="text-xl font-bold text-white">{data.limits.maxPositionSize}</p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Max Exposure</p>
              <p className="text-xl font-bold text-white">${data.limits.maxExposure}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-center text-xs text-zinc-500">
        Last updated: {new Date(data.lastUpdated).toLocaleString()}
        {data.error && <span className="text-yellow-500 ml-2">⚠️ {data.error}</span>}
      </div>
    </div>
  );
}
