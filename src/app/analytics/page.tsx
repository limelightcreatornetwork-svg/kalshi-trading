'use client';

import { useState, useEffect, useCallback } from 'react';

// Types for API responses
interface SnapshotData {
  id: string;
  date: string;
  portfolioValue: number;
  portfolioValueDollars: string;
  cashBalance: number;
  cashBalanceDollars: string;
  positionValue: number;
  positionValueDollars: string;
  dailyPnL: number;
  dailyPnLDollars: string;
  realizedPnL: number;
  realizedPnLDollars: string;
  unrealizedPnL: number;
  unrealizedPnLDollars: string;
  drawdownPercent: string;
}

interface PositionData {
  id: string;
  marketTicker: string;
  marketTitle: string | null;
  side: string;
  direction: string;
  entryPrice: number;
  entryPriceDollars: string;
  currentPrice: number;
  currentPriceDollars: string;
  quantity: number;
  pnl: number;
  pnlDollars: string;
  pnlPercent: string;
  isOpen: boolean;
  holdingDays: number;
  entryDate: string;
  exitDate: string | null;
}

interface TradeData {
  id: string;
  marketTicker: string;
  marketTitle: string | null;
  side: string;
  netPnL: number;
  netPnLDollars: string;
  pnlPercent: string;
  result: string;
  holdingPeriod: number | null;
  entryDate: string;
  exitDate: string | null;
}

interface StatsData {
  period: string;
  trades: {
    total: number;
    open: number;
    closed: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: string;
  };
  pnl: {
    total: number;
    totalDollars: string;
    realized: number;
    realizedDollars: string;
    unrealized: number;
    unrealizedDollars: string;
    avgWin: number;
    avgWinDollars: string;
    avgLoss: number;
    avgLossDollars: string;
    largestWin: number;
    largestWinDollars: string;
    largestLoss: number;
    largestLossDollars: string;
  };
  metrics: {
    profitFactor: string;
    sharpeRatio: string;
    sortinoRatio: string;
    expectancyDollars: string;
  };
  drawdown: {
    maxPercent: string;
    currentPercent: string;
  };
  holdingPeriod: {
    average: string;
  };
  bestTrades: TradeData[];
  worstTrades: TradeData[];
}

type Period = '7d' | '30d' | '90d' | 'all';

// Simple line chart component using SVG
function PnLChart({ data }: { data: SnapshotData[] }) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 bg-gray-50 rounded-lg">
        No data available. Add daily snapshots to see the chart.
      </div>
    );
  }

  const values = data.map(d => d.portfolioValue);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  const width = 800;
  const height = 256;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((d.portfolioValue - min) / range) * chartHeight;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => 
    `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`
  ).join(' ');

  // Fill area
  const fillD = `${pathD} L ${points[points.length - 1].x} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
        <g key={pct}>
          <line
            x1={padding}
            y1={padding + chartHeight * pct}
            x2={width - padding}
            y2={padding + chartHeight * pct}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <text
            x={padding - 5}
            y={padding + chartHeight * pct + 4}
            textAnchor="end"
            className="text-xs fill-gray-500"
          >
            ${((max - range * pct) / 100).toFixed(0)}
          </text>
        </g>
      ))}

      {/* Fill area */}
      <path d={fillD} fill="url(#gradient)" opacity="0.3" />
      
      {/* Line */}
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" />
      
      {/* Points */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="4"
          fill="#10b981"
          className="hover:r-6 transition-all cursor-pointer"
        >
          <title>{p.date}: ${p.portfolioValueDollars}</title>
        </circle>
      ))}

      {/* Date labels */}
      {points.filter((_, i) => i % Math.ceil(points.length / 5) === 0 || i === points.length - 1).map((p) => (
        <text
          key={p.date}
          x={p.x}
          y={height - 10}
          textAnchor="middle"
          className="text-xs fill-gray-500"
        >
          {p.date.slice(5)}
        </text>
      ))}

      {/* Gradient definition */}
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Stats Card component
function StatsCard({ 
  title, 
  value, 
  subValue, 
  trend 
}: { 
  title: string; 
  value: string; 
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500';
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className={`text-2xl font-bold mt-1 ${trendColor}`}>{value}</p>
      {subValue && <p className="text-sm text-gray-400 mt-1">{subValue}</p>}
    </div>
  );
}

// Position table row
function PositionRow({ position }: { position: PositionData }) {
  const pnlColor = position.pnl >= 0 ? 'text-green-600' : 'text-red-600';
  
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 font-mono text-sm">{position.marketTicker}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          position.side === 'yes' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {position.side.toUpperCase()}
        </span>
      </td>
      <td className="px-4 py-3 text-right">${position.entryPriceDollars}</td>
      <td className="px-4 py-3 text-right">${position.currentPriceDollars}</td>
      <td className="px-4 py-3 text-right">{position.quantity}</td>
      <td className={`px-4 py-3 text-right font-medium ${pnlColor}`}>
        ${position.pnlDollars}
      </td>
      <td className={`px-4 py-3 text-right ${pnlColor}`}>
        {position.pnlPercent}
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          position.isOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
        }`}>
          {position.isOpen ? 'Open' : 'Closed'}
        </span>
      </td>
    </tr>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d');
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate date range based on period
      const endDate = new Date().toISOString().split('T')[0];
      let startDate: string;
      
      switch (period) {
        case '7d':
          startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case '30d':
          startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        case '90d':
          startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          break;
        default:
          startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      }

      const [historyRes, positionsRes, statsRes] = await Promise.all([
        fetch(`/api/analytics/history?startDate=${startDate}&endDate=${endDate}`),
        fetch('/api/analytics/positions?includeClosed=true'),
        fetch(`/api/analytics/stats?period=${period}`),
      ]);

      const [historyData, positionsData, statsData] = await Promise.all([
        historyRes.json(),
        positionsRes.json(),
        statsRes.json(),
      ]);

      if (historyData.success) {
        setSnapshots(historyData.data.snapshots);
      }

      if (positionsData.success) {
        setPositions(positionsData.data.positions);
      }

      if (statsData.success) {
        setStats(statsData.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-8"></div>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
            <div className="h-64 bg-gray-200 rounded mb-8"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Portfolio Analytics</h1>
          
          {/* Period Selector */}
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  period === p
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="Total P&L"
              value={`$${stats.pnl.totalDollars}`}
              subValue={`${stats.pnl.total >= 0 ? '+' : ''}${stats.pnl.totalDollars}`}
              trend={stats.pnl.total >= 0 ? 'up' : 'down'}
            />
            <StatsCard
              title="Win Rate"
              value={stats.trades.winRate}
              subValue={`${stats.trades.wins}W / ${stats.trades.losses}L`}
              trend={parseFloat(stats.trades.winRate) >= 50 ? 'up' : 'down'}
            />
            <StatsCard
              title="Profit Factor"
              value={stats.metrics.profitFactor}
              subValue="Gross Profit / Gross Loss"
              trend={parseFloat(stats.metrics.profitFactor) >= 1 ? 'up' : 'down'}
            />
            <StatsCard
              title="Sharpe Ratio"
              value={stats.metrics.sharpeRatio}
              subValue="Risk-adjusted return"
              trend={parseFloat(stats.metrics.sharpeRatio) >= 0 ? 'up' : 'down'}
            />
          </div>
        )}

        {/* P&L Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Portfolio Value Over Time</h2>
          <PnLChart data={snapshots} />
        </div>

        {/* Secondary Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="Best Trade"
              value={`$${stats.pnl.largestWinDollars}`}
              trend="up"
            />
            <StatsCard
              title="Worst Trade"
              value={`$${stats.pnl.largestLossDollars}`}
              trend="down"
            />
            <StatsCard
              title="Max Drawdown"
              value={stats.drawdown.maxPercent}
              subValue={`Current: ${stats.drawdown.currentPercent}`}
              trend="down"
            />
            <StatsCard
              title="Avg Holding"
              value={stats.holdingPeriod.average}
              trend="neutral"
            />
          </div>
        )}

        {/* Position Breakdown Table */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Position Breakdown</h2>
            <p className="text-sm text-gray-500 mt-1">
              {positions.length} positions ({positions.filter(p => p.isOpen).length} open)
            </p>
          </div>
          
          {positions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Market</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Side</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Entry</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">P&L %</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {positions.map((position) => (
                    <PositionRow key={position.id} position={position} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              No positions recorded yet. Record trades via the API to see them here.
            </div>
          )}
        </div>

        {/* Best & Worst Trades */}
        {stats && (stats.bestTrades.length > 0 || stats.worstTrades.length > 0) && (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Best Trades */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-200 bg-green-50">
                <h3 className="text-lg font-semibold text-green-800">🏆 Best Trades</h3>
              </div>
              <div className="p-4">
                {stats.bestTrades.length > 0 ? (
                  <div className="space-y-3">
                    {stats.bestTrades.map((trade) => (
                      <div key={trade.id} className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                        <div>
                          <p className="font-mono text-sm font-medium">{trade.marketTicker}</p>
                          <p className="text-xs text-gray-500">{trade.side.toUpperCase()} • {trade.holdingPeriod}d</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">+${trade.netPnLDollars}</p>
                          <p className="text-xs text-green-500">{trade.pnlPercent}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No winning trades yet</p>
                )}
              </div>
            </div>

            {/* Worst Trades */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-4 border-b border-gray-200 bg-red-50">
                <h3 className="text-lg font-semibold text-red-800">📉 Worst Trades</h3>
              </div>
              <div className="p-4">
                {stats.worstTrades.length > 0 ? (
                  <div className="space-y-3">
                    {stats.worstTrades.map((trade) => (
                      <div key={trade.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                        <div>
                          <p className="font-mono text-sm font-medium">{trade.marketTicker}</p>
                          <p className="text-xs text-gray-500">{trade.side.toUpperCase()} • {trade.holdingPeriod}d</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-red-600">${trade.netPnLDollars}</p>
                          <p className="text-xs text-red-500">{trade.pnlPercent}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No losing trades yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Data updates in real-time. Add daily snapshots via POST /api/analytics/history</p>
          <p className="mt-1">Record trades via POST /api/analytics/positions</p>
        </div>
      </div>
    </div>
  );
}
