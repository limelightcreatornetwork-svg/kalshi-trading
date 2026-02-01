"use client";

import { useState } from "react";

interface TradeRecord {
  id: string;
  marketTicker: string;
  marketTitle: string;
  side: "yes" | "no";
  contracts: number;
  entryPrice: number;
  exitPrice: number | null;
  outcome: "win" | "loss" | "pending";
  pnl: number | null;
  thesis: string;
  confidence: number;
  category: string;
  entryDate: string;
  closedDate: string | null;
}

interface PerformanceMetrics {
  totalExposure: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  roi: number;
  brierScore: number;
  totalBets: number;
  openPositions: number;
  avgConfidence: number;
}

interface CategoryBreakdown {
  category: string;
  bets: number;
  pnl: number;
  winRate: number;
}

const demoMetrics: PerformanceMetrics = {
  totalExposure: 450,
  realizedPnl: 342.50,
  unrealizedPnl: 85.20,
  winRate: 62.5,
  roi: 28.5,
  brierScore: 0.18,
  totalBets: 48,
  openPositions: 5,
  avgConfidence: 7.2,
};

const demoTrades: TradeRecord[] = [
  { id: "1", marketTicker: "POTUS-2024-TRUMP", marketTitle: "Trump wins 2024 election?", side: "yes", contracts: 50, entryPrice: 0.52, exitPrice: null, outcome: "pending", pnl: null, thesis: "Strong polling in swing states, Biden approval low", confidence: 7, category: "Politics", entryDate: "2024-01-25", closedDate: null },
  { id: "2", marketTicker: "FED-RATE-MAR", marketTitle: "Fed cuts in March?", side: "no", contracts: 100, entryPrice: 0.85, exitPrice: 0.92, outcome: "win", pnl: 70, thesis: "Inflation still elevated, Powell hawkish tone", confidence: 8, category: "Economics", entryDate: "2024-01-20", closedDate: "2024-01-28" },
  { id: "3", marketTicker: "NFL-SUPERBOWL-KC", marketTitle: "Chiefs win Super Bowl?", side: "yes", contracts: 75, entryPrice: 0.48, exitPrice: null, outcome: "pending", pnl: null, thesis: "Mahomes factor, strong playoff run", confidence: 6, category: "Sports", entryDate: "2024-01-28", closedDate: null },
  { id: "4", marketTicker: "NVDA-400-FEB", marketTitle: "NVIDIA above $400 Feb?", side: "yes", contracts: 40, entryPrice: 0.65, exitPrice: 0.82, outcome: "win", pnl: 68, thesis: "AI demand strong, earnings catalyst", confidence: 8, category: "Economics", entryDate: "2024-01-15", closedDate: "2024-01-26" },
  { id: "5", marketTicker: "BITCOIN-50K-JAN", marketTitle: "Bitcoin above $50k Jan?", side: "yes", contracts: 30, entryPrice: 0.55, exitPrice: 0.00, outcome: "loss", pnl: -16.50, thesis: "ETF approval momentum", confidence: 5, category: "Economics", entryDate: "2024-01-10", closedDate: "2024-01-31" },
  { id: "6", marketTicker: "OSCAR-OPPEN", marketTitle: "Oppenheimer Best Picture?", side: "yes", contracts: 25, entryPrice: 0.72, exitPrice: null, outcome: "pending", pnl: null, thesis: "Critical acclaim, awards momentum", confidence: 8, category: "Entertainment", entryDate: "2024-01-22", closedDate: null },
];

const categoryBreakdown: CategoryBreakdown[] = [
  { category: "Politics", bets: 15, pnl: 145, winRate: 67 },
  { category: "Economics", bets: 18, pnl: 122, winRate: 61 },
  { category: "Sports", bets: 10, pnl: 55, winRate: 60 },
  { category: "Entertainment", bets: 5, pnl: 20, winRate: 60 },
];

const dailyPnl = [
  { date: "Jan 22", pnl: 35, bets: 3 },
  { date: "Jan 23", pnl: -18, bets: 2 },
  { date: "Jan 24", pnl: 52, bets: 4 },
  { date: "Jan 25", pnl: 28, bets: 2 },
  { date: "Jan 26", pnl: 68, bets: 3 },
  { date: "Jan 27", pnl: -12, bets: 1 },
  { date: "Jan 28", pnl: 70, bets: 4 },
  { date: "Jan 29", pnl: 45, bets: 2 },
  { date: "Jan 30", pnl: 22, bets: 3 },
];

export default function AnalysisPage() {
  const [metrics] = useState<PerformanceMetrics>(demoMetrics);
  const [trades] = useState<TradeRecord[]>(demoTrades);
  const [timeframe, setTimeframe] = useState<"1W" | "1M" | "3M" | "YTD" | "ALL">("1M");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterOutcome, setFilterOutcome] = useState<string>("all");

  const filteredTrades = trades.filter((t) => {
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterOutcome !== "all" && t.outcome !== filterOutcome) return false;
    return true;
  });

  const categories = [...new Set(trades.map((t) => t.category))];
  const maxPnl = Math.max(...dailyPnl.map((d) => Math.abs(d.pnl)));

  const getOutcomeColor = (outcome: string) => {
    if (outcome === "win") return "text-green-400";
    if (outcome === "loss") return "text-red-400";
    return "text-yellow-400";
  };

  const getOutcomeBadge = (outcome: string) => {
    if (outcome === "win") return "bg-green-900/50 text-green-400";
    if (outcome === "loss") return "bg-red-900/50 text-red-400";
    return "bg-yellow-900/50 text-yellow-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📊 Performance Analysis</h1>
        <div className="flex space-x-2">
          {(["1W", "1M", "3M", "YTD", "ALL"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                timeframe === tf
                  ? "bg-purple-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Total P&L</div>
          <div className={`text-2xl font-bold ${metrics.realizedPnl + metrics.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {metrics.realizedPnl + metrics.unrealizedPnl >= 0 ? "+" : ""}${(metrics.realizedPnl + metrics.unrealizedPnl).toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">
            Realized: ${metrics.realizedPnl.toFixed(2)} | Unrealized: ${metrics.unrealizedPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Win Rate</div>
          <div className="text-2xl font-bold">{metrics.winRate}%</div>
          <div className="text-xs text-gray-400">{metrics.totalBets} total bets</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">ROI</div>
          <div className={`text-2xl font-bold ${metrics.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
            {metrics.roi >= 0 ? "+" : ""}{metrics.roi}%
          </div>
          <div className="text-xs text-gray-400">On invested capital</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-sm text-gray-400 mb-1">Brier Score</div>
          <div className="text-2xl font-bold">{metrics.brierScore}</div>
          <div className="text-xs text-gray-400">Lower is better (0 = perfect)</div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Current Exposure</div>
          <div className="text-lg font-bold">${metrics.totalExposure}</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Open Positions</div>
          <div className="text-lg font-bold">{metrics.openPositions}</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Avg Confidence</div>
          <div className="text-lg font-bold">{metrics.avgConfidence}/10</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-xs text-gray-400 mb-1">Best Category</div>
          <div className="text-lg font-bold text-green-400">Politics</div>
        </div>
      </div>

      {/* P&L Chart */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">Daily P&L</h3>
        <div className="flex items-end h-48 space-x-2">
          {dailyPnl.map((day, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center">
              <div
                className={`w-full rounded-t ${day.pnl >= 0 ? "bg-green-500" : "bg-red-500"}`}
                style={{
                  height: `${(Math.abs(day.pnl) / maxPnl) * 100}%`,
                  minHeight: "4px",
                }}
              />
              <div className="text-xs text-gray-500 mt-2">{day.date}</div>
              <div className={`text-xs ${day.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {day.pnl >= 0 ? "+" : ""}${day.pnl}
              </div>
              <div className="text-xs text-gray-600">{day.bets} bets</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">Performance by Category</h3>
        <div className="grid grid-cols-4 gap-4">
          {categoryBreakdown.map((cat) => (
            <div key={cat.category} className="bg-gray-800 rounded-lg p-4">
              <div className="font-medium mb-2">{cat.category}</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-gray-400">Bets</div>
                  <div className="font-bold">{cat.bets}</div>
                </div>
                <div>
                  <div className="text-gray-400">Win %</div>
                  <div className="font-bold">{cat.winRate}%</div>
                </div>
                <div>
                  <div className="text-gray-400">P&L</div>
                  <div className={`font-bold ${cat.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {cat.pnl >= 0 ? "+" : ""}${cat.pnl}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade Journal */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-medium">📓 Trade Journal</h3>
          <div className="flex items-center space-x-2">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
            >
              <option value="all">All Outcomes</option>
              <option value="win">Wins</option>
              <option value="loss">Losses</option>
              <option value="pending">Pending</option>
            </select>
            <button className="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded text-sm">
              Export
            </button>
          </div>
        </div>
        
        <div className="divide-y divide-gray-800">
          {filteredTrades.map((trade) => (
            <div key={trade.id} className="p-4 hover:bg-gray-800/50 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-medium">{trade.marketTitle}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${getOutcomeBadge(trade.outcome)}`}>
                      {trade.outcome.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{trade.marketTicker}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${trade.pnl !== null ? (trade.pnl >= 0 ? "text-green-400" : "text-red-400") : "text-gray-400"}`}>
                    {trade.pnl !== null ? `${trade.pnl >= 0 ? "+" : ""}$${trade.pnl.toFixed(2)}` : "Pending"}
                  </div>
                  <div className="text-xs text-gray-500">{trade.contracts} contracts</div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 text-xs mb-2">
                <span className={`px-2 py-0.5 rounded ${trade.side === "yes" ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"}`}>
                  {trade.side.toUpperCase()}
                </span>
                <span className="text-gray-400">Entry: {Math.round(trade.entryPrice * 100)}¢</span>
                {trade.exitPrice !== null && (
                  <span className="text-gray-400">Exit: {Math.round(trade.exitPrice * 100)}¢</span>
                )}
                <span className="px-2 py-0.5 bg-gray-800 rounded">{trade.category}</span>
                <span className="text-gray-400">Confidence: {trade.confidence}/10</span>
              </div>

              {trade.thesis && (
                <div className="text-sm text-gray-400 italic bg-gray-800/30 rounded p-2">
                  💭 {trade.thesis}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
