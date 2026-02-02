'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { 
  Forecast, 
  EdgeOpportunity, 
  ForecastingSummary,
  ForecastingConfig,
} from '@/types/forecasting';

interface ForecastingData {
  summary: ForecastingSummary;
  models: Array<{ id: string; type: string; description: string }>;
  config: ForecastingConfig;
  marketsScanned: number;
}

export default function ForecastingPage() {
  const [data, setData] = useState<ForecastingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState('ensemble-v1');
  const [bankroll, setBankroll] = useState(1000);
  const [minEdge, setMinEdge] = useState(0.03);
  const [showAllForecasts, setShowAllForecasts] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        model: selectedModel,
        bankroll: bankroll.toString(),
        minEdge: minEdge.toString(),
        limit: '200',
      });
      
      const res = await fetch(`/api/forecasting?${params}`);
      const json = await res.json();
      
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forecasts');
    } finally {
      setLoading(false);
    }
  }, [selectedModel, bankroll, minEdge]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPercent = (n: number) => `${(n * 100).toFixed(1)}%`;
  const formatCents = (n: number) => `$${(n / 100).toFixed(2)}`;
  const formatDollars = (n: number) => `$${n.toFixed(2)}`;

  const getEdgeColor = (edge: number) => {
    if (edge >= 0.10) return 'text-green-400';
    if (edge >= 0.05) return 'text-green-500';
    if (edge >= 0.03) return 'text-yellow-400';
    return 'text-zinc-400';
  };

  const getSignalBadge = (strength: string) => {
    switch (strength) {
      case 'strong':
        return <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded uppercase">Strong</span>;
      case 'moderate':
        return <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded uppercase">Moderate</span>;
      case 'weak':
        return <span className="px-2 py-1 bg-orange-600/20 text-orange-400 text-xs rounded uppercase">Weak</span>;
      default:
        return <span className="px-2 py-1 bg-zinc-700/50 text-zinc-400 text-xs rounded uppercase">None</span>;
    }
  };

  const getDirectionBadge = (direction: string) => {
    switch (direction) {
      case 'yes':
        return <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs rounded font-bold">BUY YES</span>;
      case 'no':
        return <span className="px-2 py-1 bg-purple-600/20 text-purple-400 text-xs rounded font-bold">BUY NO</span>;
      default:
        return <span className="px-2 py-1 bg-zinc-700/50 text-zinc-400 text-xs rounded">NEUTRAL</span>;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <Link href="/" className="text-zinc-400 hover:text-white transition-colors">
                ← Home
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-white">📊 Forecasting Models</h1>
            <p className="text-zinc-400 mt-1">
              Compare model predictions vs market prices to find edge
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              loading
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading...
              </span>
            ) : (
              '🔄 Refresh'
            )}
          </button>
        </div>

        {/* Configuration Panel */}
        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 mb-8">
          <h2 className="text-lg font-semibold mb-4">Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Model Selection */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Forecast Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
              >
                {data?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.id} ({model.type})
                  </option>
                )) || (
                  <>
                    <option value="ensemble-v1">ensemble-v1</option>
                    <option value="baseline-v1">baseline-v1</option>
                    <option value="mean-reversion-v1">mean-reversion-v1</option>
                    <option value="volume-weighted-v1">volume-weighted-v1</option>
                  </>
                )}
              </select>
            </div>

            {/* Bankroll */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Bankroll ($)</label>
              <input
                type="number"
                value={bankroll}
                onChange={(e) => setBankroll(Number(e.target.value))}
                min={100}
                step={100}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
              />
            </div>

            {/* Min Edge */}
            <div>
              <label className="block text-sm text-zinc-400 mb-2">Min Edge (%)</label>
              <input
                type="number"
                value={minEdge * 100}
                onChange={(e) => setMinEdge(Number(e.target.value) / 100)}
                min={0}
                max={50}
                step={0.5}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
              />
            </div>

            {/* Apply Button */}
            <div className="flex items-end">
              <button
                onClick={fetchData}
                disabled={loading}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              >
                Apply & Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            ⚠️ {error}
          </div>
        )}

        {/* Summary Stats */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Markets Scanned</div>
              <div className="text-2xl font-bold text-white">{data.marketsScanned}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">With Edge</div>
              <div className="text-2xl font-bold text-green-400">{data.summary.marketsWithEdge}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Avg Edge</div>
              <div className="text-2xl font-bold text-yellow-400">{formatPercent(data.summary.avgEdge)}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Max Edge</div>
              <div className="text-2xl font-bold text-blue-400">{formatPercent(data.summary.maxEdge)}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Total Expected Value</div>
              <div className="text-2xl font-bold text-green-400">{formatDollars(data.summary.totalExpectedValue)}</div>
            </div>
          </div>
        )}

        {/* Edge Opportunities */}
        {data?.summary?.recommendedBets && data.summary.recommendedBets.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              🎯 Edge Opportunities
              <span className="bg-green-600 text-white text-sm px-2 py-1 rounded">
                {data.summary.recommendedBets.length} found
              </span>
            </h2>

            <div className="space-y-4">
              {data.summary.recommendedBets.map((opp: EdgeOpportunity, idx: number) => (
                <div
                  key={idx}
                  className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 hover:border-green-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-center gap-3 mb-2">
                        {getSignalBadge(opp.forecast.signalStrength)}
                        {getDirectionBadge(opp.forecast.direction)}
                        <span className="text-zinc-500 text-sm">{opp.forecast.ticker}</span>
                      </div>
                      
                      <h3 className="text-lg font-medium text-white mb-3">{opp.forecast.title}</h3>

                      {/* Probability Comparison */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-zinc-400">Model Prob:</span>{' '}
                          <span className="text-blue-400 font-medium">
                            {formatPercent(opp.forecast.predictedProbability)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Market Prob:</span>{' '}
                          <span className="text-white font-medium">
                            {formatPercent(opp.forecast.marketProbability)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Edge:</span>{' '}
                          <span className={`font-bold ${getEdgeColor(Math.abs(opp.forecast.edge))}`}>
                            {opp.forecast.edge > 0 ? '+' : ''}{formatPercent(opp.forecast.edge)}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Market Price:</span>{' '}
                          <span className="text-white">{formatCents(opp.forecast.marketPrice)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Confidence:</span>{' '}
                          <span className="text-white">{formatPercent(opp.forecast.confidence)}</span>
                        </div>
                      </div>

                      {/* Kelly Sizing */}
                      <div className="bg-zinc-800 rounded p-4 mb-3">
                        <div className="text-sm text-zinc-400 mb-2">Kelly Bet Sizing (${bankroll} bankroll)</div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-zinc-500">Full Kelly:</span>{' '}
                            <span className="text-yellow-400">{formatDollars(opp.forecast.kellyFullBet)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Half Kelly:</span>{' '}
                            <span className="text-green-400 font-medium">{formatDollars(opp.forecast.kellyHalfBet)}</span>
                          </div>
                          <div>
                            <span className="text-zinc-500">Quarter Kelly:</span>{' '}
                            <span className="text-blue-400">{formatDollars(opp.forecast.kellyQuarterBet)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Reason */}
                      <div className="text-sm text-zinc-400">
                        {opp.reason}
                      </div>
                    </div>

                    {/* Action Panel */}
                    <div className="ml-6 text-right">
                      <div className="mb-2">
                        <div className="text-zinc-400 text-sm">Recommended</div>
                        <div className="text-2xl font-bold text-green-400">
                          {opp.recommendedContracts} contracts
                        </div>
                      </div>
                      <div className="text-sm text-zinc-500 mb-4">
                        Expected: {formatDollars(opp.expectedProfit)} profit
                      </div>
                      <div className="text-xs text-zinc-600">
                        Expires in {opp.forecast.daysToExpiration.toFixed(1)} days
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {data?.summary?.recommendedBets?.length === 0 && !loading && (
          <div className="bg-zinc-900 rounded-lg p-8 text-center border border-zinc-800 mb-8">
            <div className="text-zinc-400 text-lg">No edge opportunities found</div>
            <div className="text-zinc-500 text-sm mt-2">
              Try lowering the minimum edge threshold or checking different markets
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-zinc-900 rounded-lg p-6 border border-zinc-800">
          <h3 className="text-lg font-semibold mb-4">📚 How Forecasting Works</h3>
          <div className="space-y-4 text-sm text-zinc-300">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-medium mb-2">1. Implied Probability</h4>
                <p className="text-zinc-400">
                  Extract the market&apos;s implied probability from bid/ask prices. 
                  A YES price of 48¢ implies a 48% probability.
                </p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">2. Model Forecast</h4>
                <p className="text-zinc-400">
                  Apply forecasting models (mean reversion, volume-weighted, ensemble) 
                  to generate our own probability estimate.
                </p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">3. Edge Calculation</h4>
                <p className="text-zinc-400">
                  Edge = Our Probability - Market Probability. Positive edge means 
                  we think the market is underpricing the outcome.
                </p>
              </div>
              <div>
                <h4 className="text-white font-medium mb-2">4. Kelly Sizing</h4>
                <p className="text-zinc-400">
                  Kelly Criterion optimizes bet size based on edge and confidence. 
                  We recommend half or quarter Kelly for safety.
                </p>
              </div>
            </div>
            
            <div className="bg-zinc-800 p-4 rounded mt-4">
              <p className="text-green-400 font-medium mb-2">Example:</p>
              <p>Market price: 40¢ (40% implied) | Model forecast: 50%</p>
              <p>Edge: +10% | With $1000 bankroll, half Kelly = ~$50 bet</p>
              <p className="text-zinc-500 mt-2">
                If correct, you profit $1.50 per contract ($1 payout - $0.40 cost = $0.60 × expected edge)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
