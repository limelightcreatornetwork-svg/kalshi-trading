'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stat, StatGrid } from '@/components/ui/stat';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/client-api';

interface StrategyData {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  autoExecute: boolean;
  status: string;
  maxOrdersPerHour: number;
  maxPositionSize: number;
  maxNotionalPerTrade: number;
  minEdge: number;
  minConfidence: number;
  maxSpread: number;
  minLiquidity: number;
  allowedCategories: string[];
  blockedCategories: string[];
  blockedMarkets: string[];
  params: Record<string, unknown>;
  state: {
    lastRunAt: string | null;
    lastSignalAt: string | null;
    lastTradeAt: string | null;
    errorCount: number;
    lastError: string | null;
    signalsGenerated: number;
    tradesExecuted: number;
    tradesRejected: number;
    pnlToday: number;
    pnlTodayDollars: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface Summary {
  total: number;
  enabled: number;
  disabled: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

const STRATEGY_TYPES = ['VALUE', 'NEWS', 'MARKET_MAKING', 'ARBITRAGE', 'HEDGING'] as const;

const typeLabels: Record<string, string> = {
  VALUE: 'Value',
  NEWS: 'News',
  MARKET_MAKING: 'Market Making',
  ARBITRAGE: 'Arbitrage',
  HEDGING: 'Hedging',
};

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  ERROR: 'danger',
  DISABLED: 'default',
};

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    try {
      const res = await apiFetch('/api/strategies');
      const data = await res.json();
      if (data.success) {
        setStrategies(data.data.strategies);
        setSummary(data.data.summary);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch strategies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStrategies();
    const interval = setInterval(fetchStrategies, 15000);
    return () => clearInterval(interval);
  }, [fetchStrategies]);

  const toggleStrategy = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      const res = await apiFetch('/api/strategies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchStrategies();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle strategy');
    } finally {
      setToggling(null);
    }
  };

  const deleteStrategy = async (id: string) => {
    if (!confirm('Are you sure you want to delete this strategy?')) return;
    try {
      const res = await apiFetch(`/api/strategies?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchStrategies();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete strategy');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-64" />
          <div className="h-32 bg-zinc-800 rounded" />
          <div className="h-64 bg-zinc-800 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Strategy Management</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Configure and monitor trading strategies
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Strategy
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      {summary && (
        <Card>
          <CardContent className="pt-6">
            <StatGrid>
              <Stat label="Total Strategies" value={summary.total} />
              <Stat
                label="Enabled"
                value={summary.enabled}
                trend={summary.enabled > 0 ? 'up' : 'neutral'}
              />
              <Stat label="Disabled" value={summary.disabled} />
              <Stat
                label="Active"
                value={summary.byStatus.ACTIVE ?? 0}
                trend={
                  (summary.byStatus.ACTIVE ?? 0) > 0
                    ? 'up'
                    : 'neutral'
                }
              />
            </StatGrid>
          </CardContent>
        </Card>
      )}

      {/* Create Strategy Form */}
      {showCreate && (
        <CreateStrategyForm
          onCreated={() => {
            setShowCreate(false);
            fetchStrategies();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Strategy List */}
      {strategies.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-zinc-500 py-12">
              <p className="text-lg font-medium">No strategies configured</p>
              <p className="text-sm mt-1">Create a strategy to get started</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => (
            <Card key={strategy.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>{strategy.name}</CardTitle>
                    <Badge variant={statusVariant[strategy.status] ?? 'default'}>
                      {strategy.status}
                    </Badge>
                    <Badge variant="info">{typeLabels[strategy.type] ?? strategy.type}</Badge>
                    {strategy.autoExecute && (
                      <Badge variant="warning">Auto-Execute</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">
                        {strategy.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <Switch
                        checked={strategy.enabled}
                        onCheckedChange={(checked) => toggleStrategy(strategy.id, checked)}
                        disabled={toggling === strategy.id}
                      />
                    </div>
                    <button
                      onClick={() => deleteStrategy(strategy.id)}
                      className="text-zinc-500 hover:text-red-400 text-sm transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <CardDescription>
                  Created {new Date(strategy.createdAt).toLocaleDateString()} |
                  Edge &ge; {strategy.minEdge}c |
                  Confidence &ge; {(strategy.minConfidence * 100).toFixed(0)}% |
                  Max {strategy.maxOrdersPerHour} orders/hr
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Stat label="Signals" value={strategy.state.signalsGenerated} />
                  <Stat label="Trades" value={strategy.state.tradesExecuted} />
                  <Stat label="Rejected" value={strategy.state.tradesRejected} />
                  <Stat
                    label="P&L Today"
                    value={`$${strategy.state.pnlTodayDollars}`}
                    trend={strategy.state.pnlToday > 0 ? 'up' : strategy.state.pnlToday < 0 ? 'down' : 'neutral'}
                  />
                  <Stat
                    label="Errors"
                    value={strategy.state.errorCount}
                    trend={strategy.state.errorCount > 0 ? 'down' : 'neutral'}
                  />
                </div>
                {strategy.state.lastError && (
                  <div className="mt-3 text-xs text-red-400 bg-red-500/5 rounded p-2">
                    Last error: {strategy.state.lastError}
                  </div>
                )}
                {strategy.state.lastRunAt && (
                  <div className="mt-2 text-xs text-zinc-500">
                    Last run: {new Date(strategy.state.lastRunAt).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Strategy Form ───────────────────────────────────────────

function CreateStrategyForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('VALUE');
  const [autoExecute, setAutoExecute] = useState(false);
  const [minEdge, setMinEdge] = useState(2);
  const [minConfidence, setMinConfidence] = useState(0.55);
  const [maxOrdersPerHour, setMaxOrdersPerHour] = useState(10);
  const [maxPositionSize, setMaxPositionSize] = useState(100);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          type,
          autoExecute,
          minEdge,
          minConfidence,
          maxOrdersPerHour,
          maxPositionSize,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onCreated();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create strategy');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Strategy</CardTitle>
        <CardDescription>Configure a new trading strategy</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                placeholder="My Value Strategy"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
              >
                {STRATEGY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {typeLabels[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Min Edge (cents)
              </label>
              <input
                type="number"
                value={minEdge}
                onChange={(e) => setMinEdge(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min={0}
                step={0.5}
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Min Confidence (0-1)
              </label>
              <input
                type="number"
                value={minConfidence}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min={0}
                max={1}
                step={0.05}
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Max Orders/Hour
              </label>
              <input
                type="number"
                value={maxOrdersPerHour}
                onChange={(e) => setMaxOrdersPerHour(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min={1}
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-400 mb-1">
                Max Position Size
              </label>
              <input
                type="number"
                value={maxPositionSize}
                onChange={(e) => setMaxPositionSize(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                min={1}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={autoExecute}
              onCheckedChange={setAutoExecute}
            />
            <span className="text-sm text-zinc-400">
              Auto-execute trades (requires approval if off)
            </span>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? 'Creating...' : 'Create Strategy'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
