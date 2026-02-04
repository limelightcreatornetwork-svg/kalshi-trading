'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Stat, StatGrid } from '@/components/ui/stat';
import { apiFetch } from '@/lib/client-api';

interface DailyPnL {
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  fees: number;
  netPnl: number;
  cumulative: number;
}

interface Strategy {
  name: string;
  pnl: number;
  trades: number;
  winRate: number;
}

interface Trade {
  id: string;
  ticker: string;
  side: string;
  action: string;
  quantity: number;
  price: number;
  pnl: string;
  thesis: string;
  timestamp: string;
}

interface PerformanceData {
  summary: {
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
    fees: number;
    portfolioValue: number;
  };
  winRate: number;
  avgEdge: number;
  totalTrades: number;
  wins: number;
  losses: number;
  dailyPnl: DailyPnL[];
  periods: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  metrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    volatility: number;
    avgDailyReturn: number;
  };
  strategies: Strategy[];
  recentTrades: Trade[];
  lastUpdated: string;
  error?: string;
}

export default function PerformanceDashboard() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await apiFetch('/api/dashboard/performance');
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error('Failed to fetch performance data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

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
        Failed to load performance data
      </div>
    );
  }

  const isPositive = data.summary.totalPnl >= 0;
  const filteredPnl = chartPeriod === '7d'
    ? data.dailyPnl.slice(-7)
    : chartPeriod === '30d'
    ? data.dailyPnl.slice(-30)
    : data.dailyPnl;

  // Simple mini chart calculation
  const maxPnl = Math.max(...filteredPnl.map(d => d.cumulative), 0.01);
  const minPnl = Math.min(...filteredPnl.map(d => d.cumulative), 0);
  const range = maxPnl - minPnl || 1;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div
        className={`p-4 rounded-xl border ${
          isPositive
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{isPositive ? '📈' : '📉'}</span>
            <div>
              <h2 className="text-xl font-bold text-white">
                {isPositive ? 'Looking Good!' : 'Needs Attention'}
              </h2>
              <p className="text-sm text-zinc-400">
                {data.winRate.toFixed(0)}% win rate across {data.totalTrades} trades
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}${data.summary.totalPnl.toFixed(2)}
            </p>
            <p className="text-xs text-zinc-400">Total P&L</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <StatGrid>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Portfolio Value"
              value={`$${data.summary.portfolioValue.toFixed(2)}`}
              trend={isPositive ? 'up' : 'down'}
              trendValue={`${isPositive ? '+' : ''}${((data.summary.totalPnl / Math.max(data.summary.portfolioValue, 1)) * 100).toFixed(1)}%`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Win Rate"
              value={`${data.winRate.toFixed(0)}%`}
              trend={data.winRate >= 50 ? 'up' : 'down'}
              trendValue={`${data.wins}W / ${data.losses}L`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Avg Edge"
              value={`${data.avgEdge.toFixed(1)}¢`}
              trend="neutral"
              trendValue="per trade"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <Stat
              label="Sharpe Ratio"
              value={data.metrics.sharpeRatio.toFixed(2)}
              trend={data.metrics.sharpeRatio >= 1 ? 'up' : data.metrics.sharpeRatio >= 0 ? 'neutral' : 'down'}
              trendValue="annualized"
            />
          </CardContent>
        </Card>
      </StatGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* P&L Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>📈 P&L Over Time</CardTitle>
                <CardDescription>Cumulative profit and loss</CardDescription>
              </div>
              <div className="flex gap-1">
                {(['7d', '30d', 'all'] as const).map((period) => (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period)}
                    className={`px-3 py-1 text-xs rounded-md transition-colors ${
                      chartPeriod === period
                        ? 'bg-zinc-700 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {period === '7d' ? '7D' : period === '30d' ? '30D' : 'All'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Simple ASCII-style chart */}
            <div className="h-48 flex items-end gap-1">
              {filteredPnl.map((day, i) => {
                const height = ((day.cumulative - minPnl) / range) * 100;
                const isPositiveDay = day.netPnl >= 0;
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col justify-end group relative"
                  >
                    <div
                      className={`rounded-t transition-all ${
                        isPositiveDay ? 'bg-green-500' : 'bg-red-500'
                      } opacity-70 hover:opacity-100`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                      <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs whitespace-nowrap">
                        <p className="text-zinc-400">{day.date}</p>
                        <p className={isPositiveDay ? 'text-green-400' : 'text-red-400'}>
                          {isPositiveDay ? '+' : ''}${day.netPnl.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* X-axis labels */}
            <div className="flex justify-between text-xs text-zinc-500 mt-2">
              <span>{filteredPnl[0]?.date}</span>
              <span>{filteredPnl[filteredPnl.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>

        {/* Period Summary */}
        <Card>
          <CardHeader>
            <CardTitle>📅 Period P&L</CardTitle>
            <CardDescription>Performance by timeframe</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Today', value: data.periods.daily },
                { label: 'This Week', value: data.periods.weekly },
                { label: 'This Month', value: data.periods.monthly },
              ].map((period) => (
                <div
                  key={period.label}
                  className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                >
                  <span className="text-sm text-zinc-400">{period.label}</span>
                  <span
                    className={`font-bold ${
                      period.value >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {period.value >= 0 ? '+' : ''}${period.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-800">
              <h4 className="text-sm font-medium text-white mb-3">Risk Metrics</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Max Drawdown</span>
                  <span className="text-red-400">{data.metrics.maxDrawdown.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Volatility</span>
                  <span className="text-white">{data.metrics.volatility.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Avg Daily Return</span>
                  <span className={data.metrics.avgDailyReturn >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ${data.metrics.avgDailyReturn.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Strategy Performance */}
        <Card>
          <CardHeader>
            <CardTitle>🎯 Strategy Breakdown</CardTitle>
            <CardDescription>Performance by strategy type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.strategies.length > 0 ? (
                data.strategies.map((strat) => (
                  <div
                    key={strat.name}
                    className="p-4 bg-zinc-800/50 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white">{strat.name}</span>
                      <span
                        className={`font-bold ${
                          strat.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {strat.pnl >= 0 ? '+' : ''}${strat.pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{strat.trades} trades</span>
                      <span>•</span>
                      <span
                        className={
                          strat.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'
                        }
                      >
                        {strat.winRate.toFixed(0)}% win rate
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-400 text-sm text-center py-4">
                  No strategy data available
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Trades */}
        <Card>
          <CardHeader>
            <CardTitle>🔄 Recent Trades</CardTitle>
            <CardDescription>Latest executed trades with thesis</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {data.recentTrades.length > 0 ? (
                data.recentTrades.map((trade) => (
                  <div
                    key={trade.id}
                    className="p-3 bg-zinc-800/50 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-white">
                          {trade.ticker}
                        </span>
                        <Badge
                          variant={trade.side === 'yes' ? 'success' : 'danger'}
                        >
                          {trade.action.toUpperCase()} {trade.side.toUpperCase()}
                        </Badge>
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          parseFloat(trade.pnl) >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {parseFloat(trade.pnl) >= 0 ? '+' : ''}${trade.pnl}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mb-1">
                      {trade.quantity} @ ${trade.price.toFixed(2)}
                    </p>
                    <p className="text-xs text-zinc-500 italic">
                      "{trade.thesis}"
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-zinc-400 text-sm text-center py-4">
                  No recent trades
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Summary */}
      <Card>
        <CardHeader>
          <CardTitle>💵 P&L Summary</CardTitle>
          <CardDescription>Breakdown of profit and loss components</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Realized P&L</p>
              <p className={`text-xl font-bold ${data.summary.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.summary.realizedPnl >= 0 ? '+' : ''}${data.summary.realizedPnl.toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Unrealized P&L</p>
              <p className={`text-xl font-bold ${data.summary.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.summary.unrealizedPnl >= 0 ? '+' : ''}${data.summary.unrealizedPnl.toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Fees Paid</p>
              <p className="text-xl font-bold text-yellow-400">
                -${data.summary.fees.toFixed(2)}
              </p>
            </div>
            <div className="p-4 bg-zinc-800/50 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Total Trades</p>
              <p className="text-xl font-bold text-white">{data.totalTrades}</p>
            </div>
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <p className="text-xs text-zinc-400 mb-1">Net P&L</p>
              <p className={`text-xl font-bold ${data.summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {data.summary.totalPnl >= 0 ? '+' : ''}${data.summary.totalPnl.toFixed(2)}
              </p>
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
