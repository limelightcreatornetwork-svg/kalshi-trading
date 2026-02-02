"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ExecutionStep {
  order: number;
  action: 'buy' | 'sell';
  side: 'yes' | 'no';
  ticker: string;
  price: number;
  description: string;
}

interface ArbitrageOpportunity {
  id: string;
  type: 'single_market' | 'cross_market';
  markets: Array<{
    ticker: string;
    title: string;
    yes_ask: number;
    yes_bid: number;
    no_ask: number;
    no_bid: number;
  }>;
  spread: number;
  profitPotential: number;
  direction: 'buy_both' | 'sell_both' | 'complex';
  confidence: 'high' | 'medium' | 'low';
  description: string;
  executionSteps: ExecutionStep[];
  detectedAt: string;
  expiresAt?: string;
}

interface ScanResult {
  opportunities: ArbitrageOpportunity[];
  marketsScanned: number;
  scanDuration: number;
  timestamp: string;
  demo: boolean;
}

export default function ArbitragePage() {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [contracts, setContracts] = useState<number>(10);
  const [executing, setExecuting] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const fetchArbitrage = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/arbitrage/scan?limit=50');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
      setLastScan(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArbitrage();
  }, [fetchArbitrage]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchArbitrage, 10000); // 10 second polling
    return () => clearInterval(interval);
  }, [autoRefresh, fetchArbitrage]);

  const executeArbitrage = async (opportunity: ArbitrageOpportunity) => {
    setExecuting(opportunity.id);
    try {
      const response = await fetch('/api/arbitrage/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          contracts,
          steps: opportunity.executionSteps,
        }),
      });
      const result = await response.json();
      if (result.ok) {
        alert(`✅ Arbitrage executed! ${result.demo ? '(Demo mode)' : ''}`);
      } else {
        alert(`❌ Execution failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setExecuting(null);
      fetchArbitrage();
    }
  };

  const confidenceColor = (conf: string) => {
    switch (conf) {
      case 'high': return 'bg-green-600';
      case 'medium': return 'bg-yellow-600';
      case 'low': return 'bg-orange-600';
      default: return 'bg-gray-600';
    }
  };

  const typeColor = (type: string) => {
    return type === 'single_market' ? 'bg-blue-600' : 'bg-purple-600';
  };

  const calculateProfit = (opp: ArbitrageOpportunity) => {
    const gross = opp.profitPotential * contracts;
    const fees = Math.min(0.01 * opp.executionSteps.length, 0.07) * contracts;
    return {
      gross: (gross / 100).toFixed(2),
      fees: (fees / 100).toFixed(2),
      net: ((gross - fees) / 100).toFixed(2),
    };
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              ⚡ Arbitrage Scanner
            </h1>
            <p className="text-gray-400 mt-1">
              Detect mispricing opportunities in Kalshi markets
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400">
              {lastScan && `Last scan: ${lastScan.toLocaleTimeString()}`}
            </div>
            <Button
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              className={autoRefresh ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {autoRefresh ? "🔄 Auto-Refresh ON" : "Auto-Refresh OFF"}
            </Button>
            <Button onClick={fetchArbitrage} disabled={loading}>
              {loading ? "Scanning..." : "🔍 Scan Now"}
            </Button>
          </div>
        </div>

        {/* Stats Bar */}
        {data && (
          <div className="grid grid-cols-4 gap-4">
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-white">{data.opportunities.length}</div>
                <div className="text-sm text-gray-400">Opportunities Found</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-white">{data.marketsScanned}</div>
                <div className="text-sm text-gray-400">Markets Scanned</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-white">{data.scanDuration}ms</div>
                <div className="text-sm text-gray-400">Scan Duration</div>
              </CardContent>
            </Card>
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-yellow-500">{data.demo ? 'Demo' : 'Live'}</div>
                <div className="text-sm text-gray-400">Mode</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Profit Calculator */}
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">💰 Profit Calculator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400">Contracts per opportunity:</label>
              <input
                type="number"
                min="1"
                max="10000"
                value={contracts}
                onChange={(e) => setContracts(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              />
              <span className="text-sm text-gray-500">
                Each contract = $1.00 max payout
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="bg-red-900/30 border-red-700">
            <CardContent className="p-4">
              <p className="text-red-300">⚠️ Error: {error}</p>
            </CardContent>
          </Card>
        )}

        {/* Opportunities List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {data?.opportunities.length ? '🎯 Active Opportunities' : '⏳ No Opportunities Found'}
          </h2>

          {data?.opportunities.length === 0 && !loading && (
            <Card className="bg-gray-800 border-gray-700">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <p className="text-gray-400">
                  No arbitrage opportunities detected right now.
                  <br />
                  Markets are efficiently priced or using demo data.
                </p>
                <p className="text-sm text-gray-500 mt-4">
                  Tip: Enable auto-refresh to catch opportunities as they appear.
                </p>
              </CardContent>
            </Card>
          )}

          {data?.opportunities.map((opp) => {
            const profit = calculateProfit(opp);
            return (
              <Card key={opp.id} className="bg-gray-800 border-gray-700 hover:border-gray-600 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={typeColor(opp.type)}>
                          {opp.type === 'single_market' ? '📊 Single Market' : '🔗 Cross Market'}
                        </Badge>
                        <Badge className={confidenceColor(opp.confidence)}>
                          {opp.confidence.toUpperCase()} Confidence
                        </Badge>
                        <Badge variant="outline" className="text-green-400 border-green-600">
                          +{opp.profitPotential}¢ per contract
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">
                        {opp.markets[0]?.title || opp.markets[0]?.ticker}
                      </CardTitle>
                      <CardDescription className="text-gray-400">
                        {opp.description}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-400">
                        ${profit.net}
                      </div>
                      <div className="text-xs text-gray-500">
                        net profit ({contracts} contracts)
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Execution Steps */}
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2">Execution Steps:</h4>
                    <div className="space-y-1">
                      {opp.executionSteps.map((step) => (
                        <div key={step.order} className="flex items-center gap-2 text-sm">
                          <span className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded-full text-xs">
                            {step.order}
                          </span>
                          <Badge className={step.action === 'buy' ? 'bg-green-700' : 'bg-red-700'}>
                            {step.action.toUpperCase()}
                          </Badge>
                          <span className="text-gray-300">{step.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Profit Breakdown */}
                  <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-700/50 rounded">
                    <div>
                      <div className="text-xs text-gray-500">Gross Profit</div>
                      <div className="text-lg font-semibold text-white">${profit.gross}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Est. Fees</div>
                      <div className="text-lg font-semibold text-red-400">-${profit.fees}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Net Profit</div>
                      <div className="text-lg font-semibold text-green-400">${profit.net}</div>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                      Detected: {new Date(opp.detectedAt).toLocaleTimeString()}
                      {opp.expiresAt && ` • Expires: ${new Date(opp.expiresAt).toLocaleDateString()}`}
                    </div>
                    <Button
                      onClick={() => executeArbitrage(opp)}
                      disabled={executing === opp.id}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {executing === opp.id ? "Executing..." : `⚡ Execute (${contracts} contracts)`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info Box */}
        <Card className="bg-blue-900/20 border-blue-700">
          <CardContent className="p-4">
            <h3 className="font-semibold text-blue-300 mb-2">ℹ️ How Arbitrage Works</h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>
                <strong>Single Market Mispricing:</strong> In a perfect market, YES + NO prices should equal $1.00.
                If you can buy both for less than $1.00, you profit the difference (one side always wins).
              </p>
              <p>
                <strong>Cross Market Arbitrage:</strong> For mutually exclusive events (only one can happen),
                if the sum of all YES prices is less than $1.00, buying all outcomes guarantees profit.
              </p>
              <p className="text-yellow-400">
                ⚠️ Opportunities may disappear quickly. Execute promptly or prices may change.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
