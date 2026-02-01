"use client";

import { useState } from "react";

interface Strategy {
  id: string;
  name: string;
  type: string;
  description: string;
  isActive: boolean;
  categories: string[];
  parameters: {
    kellyFraction: number;
    minEdge: number;
    maxBetSize: number;
    dailyLimit: number;
  };
  backtestResults?: {
    roi: number;
    winRate: number;
    brierScore: number;
    totalBets: number;
  };
}

const defaultStrategies: Strategy[] = [
  {
    id: "1",
    name: "Value Betting",
    type: "value",
    description: "Bet when market price deviates from your estimated probability by a significant margin",
    isActive: true,
    categories: ["Politics", "Economics"],
    parameters: { kellyFraction: 0.25, minEdge: 0.10, maxBetSize: 100, dailyLimit: 500 },
    backtestResults: { roi: 18.5, winRate: 58, brierScore: 0.21, totalBets: 124 },
  },
  {
    id: "2",
    name: "Momentum Chaser",
    type: "momentum",
    description: "Follow price movements - buy when price is rising, sell when falling",
    isActive: false,
    categories: ["Sports", "Entertainment"],
    parameters: { kellyFraction: 0.15, minEdge: 0.05, maxBetSize: 50, dailyLimit: 300 },
    backtestResults: { roi: 8.2, winRate: 52, brierScore: 0.28, totalBets: 89 },
  },
  {
    id: "3",
    name: "Hedge Strategy",
    type: "hedge",
    description: "Take opposite positions in correlated markets to reduce risk",
    isActive: false,
    categories: ["Politics"],
    parameters: { kellyFraction: 0.30, minEdge: 0.08, maxBetSize: 200, dailyLimit: 1000 },
    backtestResults: { roi: 12.1, winRate: 62, brierScore: 0.19, totalBets: 45 },
  },
];

export default function StrategyPage() {
  const [strategies, setStrategies] = useState<Strategy[]>(defaultStrategies);
  const [showBuilder, setShowBuilder] = useState(false);

  // Kelly Calculator state
  const [kelly, setKelly] = useState({
    probability: 60,
    marketPrice: 50,
    bankroll: 1000,
    kellyFraction: 25,
  });

  const toggleStrategy = (id: string) => {
    setStrategies(
      strategies.map((s) =>
        s.id === id ? { ...s, isActive: !s.isActive } : s
      )
    );
  };

  // Kelly Criterion calculation
  const calculateKelly = () => {
    const p = kelly.probability / 100; // Your estimated probability
    const b = (100 - kelly.marketPrice) / kelly.marketPrice; // Odds (payout ratio)
    const q = 1 - p;
    
    // Kelly formula: f* = (p * b - q) / b
    const fullKelly = (p * b - q) / b;
    const adjustedKelly = fullKelly * (kelly.kellyFraction / 100);
    
    // Edge calculation
    const expectedValue = p * (100 - kelly.marketPrice) - (1 - p) * kelly.marketPrice;
    const edge = expectedValue / kelly.marketPrice;
    
    return {
      fullKelly: Math.max(0, fullKelly * 100),
      adjustedKelly: Math.max(0, adjustedKelly * 100),
      betSize: Math.max(0, kelly.bankroll * adjustedKelly),
      edge: edge * 100,
      ev: expectedValue,
    };
  };

  const kellyResults = calculateKelly();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎯 Strategy Management</h1>
        <button
          onClick={() => setShowBuilder(!showBuilder)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {showBuilder ? "Hide Builder" : "+ New Strategy"}
        </button>
      </div>

      {/* Kelly Criterion Calculator */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">🧮 Kelly Criterion Calculator</h3>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Your Probability (%)</label>
            <input
              type="number"
              value={kelly.probability}
              onChange={(e) => setKelly({ ...kelly, probability: Number(e.target.value) })}
              min={0}
              max={100}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Market Price (¢)</label>
            <input
              type="number"
              value={kelly.marketPrice}
              onChange={(e) => setKelly({ ...kelly, marketPrice: Number(e.target.value) })}
              min={1}
              max={99}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bankroll ($)</label>
            <input
              type="number"
              value={kelly.bankroll}
              onChange={(e) => setKelly({ ...kelly, bankroll: Number(e.target.value) })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Kelly Fraction (%)</label>
            <input
              type="number"
              value={kelly.kellyFraction}
              onChange={(e) => setKelly({ ...kelly, kellyFraction: Number(e.target.value) })}
              min={1}
              max={100}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
            />
          </div>
          <div className={`rounded-lg p-3 border ${kellyResults.edge > 0 ? "bg-green-900/30 border-green-800" : "bg-red-900/30 border-red-800"}`}>
            <div className="text-xs text-gray-400 mb-1">Recommended Bet</div>
            <div className="text-xl font-bold">${kellyResults.betSize.toFixed(2)}</div>
            <div className={`text-xs ${kellyResults.edge > 0 ? "text-green-400" : "text-red-400"}`}>
              Edge: {kellyResults.edge.toFixed(1)}%
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-800">
          <div className="text-center">
            <div className="text-xs text-gray-400">Full Kelly</div>
            <div className="font-bold">{kellyResults.fullKelly.toFixed(1)}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">Adjusted Kelly</div>
            <div className="font-bold">{kellyResults.adjustedKelly.toFixed(1)}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">Expected Value</div>
            <div className={`font-bold ${kellyResults.ev > 0 ? "text-green-400" : "text-red-400"}`}>
              {kellyResults.ev > 0 ? "+" : ""}{kellyResults.ev.toFixed(2)}¢
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400">Verdict</div>
            <div className={`font-bold ${kellyResults.edge > 5 ? "text-green-400" : kellyResults.edge > 0 ? "text-yellow-400" : "text-red-400"}`}>
              {kellyResults.edge > 10 ? "Strong Bet" : kellyResults.edge > 5 ? "Good Bet" : kellyResults.edge > 0 ? "Marginal" : "No Edge"}
            </div>
          </div>
        </div>
      </div>

      {/* Risk Parameters */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium mb-4">⚙️ Risk Parameters</h3>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max Bet Size</label>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">$</span>
              <input
                type="number"
                defaultValue={100}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Daily Loss Limit</label>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">$</span>
              <input
                type="number"
                defaultValue={500}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max Exposure</label>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">$</span>
              <input
                type="number"
                defaultValue={1000}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Min Edge Required</label>
            <div className="flex items-center">
              <input
                type="number"
                defaultValue={5}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
              <span className="text-gray-500 ml-2">%</span>
            </div>
          </div>
        </div>
        <button className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
          Save Parameters
        </button>
      </div>

      {/* Strategy Builder */}
      {showBuilder && (
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-4">
          <h3 className="text-lg font-medium">Strategy Builder</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Strategy Name</label>
              <input
                type="text"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                placeholder="My Kalshi Strategy"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                <option value="value">Value Betting</option>
                <option value="momentum">Momentum</option>
                <option value="hedge">Hedging</option>
                <option value="arbitrage">Arbitrage</option>
                <option value="contrarian">Contrarian</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 h-20"
              placeholder="Describe your strategy and when to use it..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Categories</label>
            <div className="flex flex-wrap gap-2">
              {["Politics", "Economics", "Sports", "Entertainment", "Science", "Weather"].map((cat) => (
                <label key={cat} className="flex items-center space-x-2 bg-gray-800 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-gray-700">
                  <input type="checkbox" className="rounded" />
                  <span className="text-sm">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Kelly Fraction</label>
              <input
                type="number"
                defaultValue={25}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Min Edge %</label>
              <input
                type="number"
                defaultValue={10}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Bet Size</label>
              <input
                type="number"
                defaultValue={100}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Daily Limit</label>
              <input
                type="number"
                defaultValue={500}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              />
            </div>
          </div>

          <div className="flex space-x-2">
            <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
              Save Strategy
            </button>
            <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium">
              Run Backtest
            </button>
          </div>
        </div>
      )}

      {/* Active Strategies */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Your Strategies</h3>
        {strategies.map((strategy) => (
          <div
            key={strategy.id}
            className={`bg-gray-900 rounded-xl p-4 border ${
              strategy.isActive ? "border-green-700" : "border-gray-800"
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="font-bold text-lg">{strategy.name}</h4>
                  <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                    {strategy.type}
                  </span>
                  {strategy.isActive && (
                    <span className="px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
                      ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mb-3">{strategy.description}</p>

                <div className="flex flex-wrap gap-1 mb-3">
                  {strategy.categories.map((cat) => (
                    <span key={cat} className="px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded text-xs">
                      {cat}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400">Kelly</div>
                    <div className="font-bold">{strategy.parameters.kellyFraction}%</div>
                  </div>
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400">Min Edge</div>
                    <div className="font-bold">{strategy.parameters.minEdge * 100}%</div>
                  </div>
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400">Max Bet</div>
                    <div className="font-bold">${strategy.parameters.maxBetSize}</div>
                  </div>
                  <div className="bg-gray-800 rounded p-2">
                    <div className="text-gray-400">Daily Limit</div>
                    <div className="font-bold">${strategy.parameters.dailyLimit}</div>
                  </div>
                </div>

                {strategy.backtestResults && (
                  <div className="grid grid-cols-4 gap-4 p-3 bg-gray-800/50 rounded-lg">
                    <div>
                      <div className="text-xs text-gray-400">ROI</div>
                      <div className={`font-bold ${strategy.backtestResults.roi > 0 ? "text-green-400" : "text-red-400"}`}>
                        {strategy.backtestResults.roi > 0 ? "+" : ""}{strategy.backtestResults.roi}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Win Rate</div>
                      <div className="font-bold">{strategy.backtestResults.winRate}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Brier Score</div>
                      <div className="font-bold">{strategy.backtestResults.brierScore}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Total Bets</div>
                      <div className="font-bold">{strategy.backtestResults.totalBets}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col space-y-2 ml-4">
                <button
                  onClick={() => toggleStrategy(strategy.id)}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    strategy.isActive
                      ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                      : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                  }`}
                >
                  {strategy.isActive ? "Disable" : "Enable"}
                </button>
                <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Edit
                </button>
                <button className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm">
                  Backtest
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
