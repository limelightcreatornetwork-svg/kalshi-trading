'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ArbitrageOpportunity, MarketWithArbitrage, ArbitrageScanResult } from '@/types/arbitrage';

interface ScanStats {
  totalScans: number;
  totalOpportunities: number;
  avgProfitCents: number;
  totalProfitPotential: number;
  executedCount: number;
  totalActualProfit: number;
}

export default function ArbitragePage() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [allMarkets, setAllMarkets] = useState<MarketWithArbitrage[]>([]);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<ArbitrageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [contractsToExecute, setContractsToExecute] = useState<Record<string, number>>({});

  // Fetch current opportunities on mount
  const fetchOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/arbitrage/scan');
      const data = await res.json();
      
      if (data.success) {
        setOpportunities(data.data.opportunities || []);
        setStats(data.data.stats || null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch opportunities');
    }
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  // Run a new scan
  const runScan = async () => {
    setScanning(true);
    setError(null);
    
    try {
      const res = await fetch('/api/arbitrage/scan', { method: 'POST' });
      const data = await res.json();
      
      if (data.success) {
        setLastScan(data.data);
        setOpportunities(data.data.opportunities || []);
        setAllMarkets(data.data.allMarkets || []);
        // Refresh stats
        await fetchOpportunities();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  // Execute an opportunity
  const executeOpportunity = async (opportunityId: string) => {
    const contracts = contractsToExecute[opportunityId] || 1;
    setExecuting(opportunityId);
    setError(null);
    
    try {
      const res = await fetch('/api/arbitrage/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunityId, contracts }),
      });
      const data = await res.json();
      
      if (data.success) {
        // Refresh opportunities
        await fetchOpportunities();
        alert(`Executed! Expected profit: $${(data.data.expectedProfit / 100).toFixed(2)}`);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(null);
    }
  };

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(4)}`;
  const formatPercent = (pct: number) => `${pct.toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Arbitrage Scanner</h1>
            <p className="text-zinc-400 mt-1">
              Detect pricing inefficiencies in Kalshi markets
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              scanning
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-500 text-white'
            }`}
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Scanning...
              </span>
            ) : (
              '🔍 Scan Markets'
            )}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
            ⚠️ {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Total Scans</div>
              <div className="text-2xl font-bold text-white">{stats.totalScans}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Opportunities Found</div>
              <div className="text-2xl font-bold text-green-400">{stats.totalOpportunities}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Avg Profit/Contract</div>
              <div className="text-2xl font-bold text-yellow-400">{formatCents(stats.avgProfitCents)}</div>
            </div>
            <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="text-zinc-400 text-sm">Total Executed</div>
              <div className="text-2xl font-bold text-blue-400">{stats.executedCount}</div>
            </div>
          </div>
        )}

        {/* Last Scan Results */}
        {lastScan && (
          <div className="mb-8 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
            <h3 className="text-lg font-semibold mb-2">Latest Scan Results</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-zinc-400">Markets Scanned:</span>{' '}
                <span className="text-white font-medium">{lastScan.marketsScanned}</span>
              </div>
              <div>
                <span className="text-zinc-400">Opportunities:</span>{' '}
                <span className="text-green-400 font-medium">{lastScan.opportunitiesFound}</span>
              </div>
              <div>
                <span className="text-zinc-400">Total Profit Potential:</span>{' '}
                <span className="text-yellow-400 font-medium">{formatCents(lastScan.totalProfitPotential)}</span>
              </div>
              <div>
                <span className="text-zinc-400">Scan Time:</span>{' '}
                <span className="text-white font-medium">{lastScan.scanDurationMs}ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Active Opportunities */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            🎯 Active Arbitrage Opportunities
            {opportunities.length > 0 && (
              <span className="bg-green-600 text-white text-sm px-2 py-1 rounded">
                {opportunities.length} found
              </span>
            )}
          </h2>

          {opportunities.length === 0 ? (
            <div className="bg-zinc-900 rounded-lg p-8 text-center border border-zinc-800">
              <div className="text-zinc-400 text-lg">No arbitrage opportunities detected</div>
              <div className="text-zinc-500 text-sm mt-2">
                Run a scan to check for pricing inefficiencies
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="bg-zinc-900 rounded-lg p-6 border border-zinc-800 hover:border-green-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs rounded uppercase">
                          {opp.type.replace('_', ' ')}
                        </span>
                        <span className="text-zinc-500 text-sm">{opp.marketTicker}</span>
                      </div>
                      <h3 className="text-lg font-medium text-white mb-3">{opp.marketTitle}</h3>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-zinc-400">YES Ask:</span>{' '}
                          <span className="text-white">{formatCents(opp.yesAsk)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">NO Ask:</span>{' '}
                          <span className="text-white">{formatCents(opp.noAsk)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Total Cost:</span>{' '}
                          <span className="text-yellow-400">{formatCents(opp.totalCost)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Guaranteed:</span>{' '}
                          <span className="text-green-400">$1.00</span>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-6">
                        <div className="bg-green-600/20 px-4 py-2 rounded">
                          <span className="text-zinc-400 text-sm">Profit/Contract: </span>
                          <span className="text-green-400 font-bold text-lg">
                            {formatCents(opp.profitCents)}
                          </span>
                        </div>
                        <div className="bg-blue-600/20 px-4 py-2 rounded">
                          <span className="text-zinc-400 text-sm">ROI: </span>
                          <span className="text-blue-400 font-bold text-lg">
                            {formatPercent(opp.profitPercent)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Execute Controls */}
                    <div className="ml-6 flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <label className="text-zinc-400 text-sm">Contracts:</label>
                        <input
                          type="number"
                          min="1"
                          value={contractsToExecute[opp.id] || 1}
                          onChange={(e) =>
                            setContractsToExecute({
                              ...contractsToExecute,
                              [opp.id]: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-center"
                        />
                      </div>
                      <button
                        onClick={() => executeOpportunity(opp.id)}
                        disabled={executing === opp.id}
                        className={`px-4 py-2 rounded font-medium transition-all ${
                          executing === opp.id
                            ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-500 text-white'
                        }`}
                      >
                        {executing === opp.id ? 'Executing...' : '⚡ Execute'}
                      </button>
                      <div className="text-zinc-500 text-xs text-right">
                        Est. Profit: {formatCents(opp.profitCents * (contractsToExecute[opp.id] || 1))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Markets Analysis (collapsible) */}
        {allMarkets.length > 0 && (
          <div>
            <button
              onClick={() => setShowAllMarkets(!showAllMarkets)}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4"
            >
              <span className="text-lg">{showAllMarkets ? '▼' : '▶'}</span>
              <span className="text-lg font-medium">
                All Markets Analysis ({allMarkets.length} markets)
              </span>
            </button>

            {showAllMarkets && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900 border-b border-zinc-700">
                    <tr>
                      <th className="text-left p-3 text-zinc-400">Market</th>
                      <th className="text-right p-3 text-zinc-400">YES Ask</th>
                      <th className="text-right p-3 text-zinc-400">NO Ask</th>
                      <th className="text-right p-3 text-zinc-400">Total Cost</th>
                      <th className="text-right p-3 text-zinc-400">Spread</th>
                      <th className="text-center p-3 text-zinc-400">Arbitrage?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allMarkets.map((market) => (
                      <tr
                        key={market.ticker}
                        className={`border-b border-zinc-800 ${
                          market.hasArbitrage ? 'bg-green-900/20' : ''
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-medium text-white truncate max-w-xs">
                            {market.title}
                          </div>
                          <div className="text-zinc-500 text-xs">{market.ticker}</div>
                        </td>
                        <td className="text-right p-3 text-white">{formatCents(market.yesAsk)}</td>
                        <td className="text-right p-3 text-white">{formatCents(market.noAsk)}</td>
                        <td className="text-right p-3 text-yellow-400">{formatCents(market.buyBothCost)}</td>
                        <td className="text-right p-3">
                          {market.buyBothCost < 100 ? (
                            <span className="text-green-400">+{formatCents(100 - market.buyBothCost)}</span>
                          ) : market.buyBothCost > 100 ? (
                            <span className="text-red-400">-{formatCents(market.buyBothCost - 100)}</span>
                          ) : (
                            <span className="text-zinc-400">$0.00</span>
                          )}
                        </td>
                        <td className="text-center p-3">
                          {market.hasArbitrage ? (
                            <span className="text-green-400">✅ Yes</span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 p-6 bg-zinc-900 rounded-lg border border-zinc-800">
          <h3 className="text-lg font-semibold mb-4">📚 How Arbitrage Works</h3>
          <div className="space-y-4 text-sm text-zinc-300">
            <p>
              <strong className="text-white">Single-Market Arbitrage:</strong> In a binary market,
              YES + NO should always equal $1.00. If the sum of ASK prices is less than $1.00,
              you can buy both sides and guarantee a profit when the market resolves.
            </p>
            <div className="bg-zinc-800 p-4 rounded">
              <p className="text-green-400 font-medium">Example (Profitable):</p>
              <p>YES Ask = $0.48, NO Ask = $0.48</p>
              <p>Total cost = $0.96, Guaranteed payout = $1.00</p>
              <p className="text-green-400">Profit = $0.04 per contract (4.17% ROI)</p>
            </div>
            <div className="bg-zinc-800 p-4 rounded">
              <p className="text-red-400 font-medium">Example (Loss):</p>
              <p>YES Ask = $0.52, NO Ask = $0.52</p>
              <p>Total cost = $1.04, Guaranteed payout = $1.00</p>
              <p className="text-red-400">Loss = $0.04 per contract (-3.85% ROI)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
