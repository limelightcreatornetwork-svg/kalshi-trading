import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="max-w-4xl mx-auto px-8 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            Kalshi Trading Platform
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
            Advanced trading tools for Kalshi prediction markets. Detect arbitrage opportunities,
            manage positions, and execute trades with confidence.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {/* Arbitrage Scanner - Primary Feature */}
          <Link
            href="/arbitrage"
            className="group p-8 bg-gradient-to-br from-green-900/30 to-green-800/20 rounded-xl border border-green-500/30 hover:border-green-400/50 transition-all hover:scale-[1.02]"
          >
            <div className="text-4xl mb-4">🎯</div>
            <h2 className="text-2xl font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
              Arbitrage Scanner
            </h2>
            <p className="text-zinc-400 mb-4">
              Detect pricing inefficiencies across Kalshi markets. Find opportunities where
              YES + NO prices don&apos;t equal $1.00.
            </p>
            <ul className="text-sm text-zinc-500 space-y-1">
              <li>✓ Real-time market scanning</li>
              <li>✓ Single-market mispricing detection</li>
              <li>✓ One-click trade execution</li>
              <li>✓ Profit tracking & analytics</li>
            </ul>
          </Link>

          {/* Markets */}
          <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
            <div className="text-4xl mb-4">📊</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Market Data
            </h2>
            <p className="text-zinc-400 mb-4">
              Browse and analyze all active Kalshi markets with real-time pricing data.
            </p>
            <ul className="text-sm text-zinc-500 space-y-1">
              <li>✓ Live bid/ask prices</li>
              <li>✓ Volume & open interest</li>
              <li>✓ Market filtering</li>
            </ul>
          </div>

          {/* Order Management */}
          <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
            <div className="text-4xl mb-4">📝</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Order Management
            </h2>
            <p className="text-zinc-400 mb-4">
              Full order lifecycle management with state machine validation.
            </p>
            <ul className="text-sm text-zinc-500 space-y-1">
              <li>✓ Idempotent order placement</li>
              <li>✓ State machine tracking</li>
              <li>✓ Fill notifications</li>
            </ul>
          </div>

          {/* Risk Controls */}
          <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
            <div className="text-4xl mb-4">🛡️</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Risk Controls
            </h2>
            <p className="text-zinc-400 mb-4">
              Kill switches and position caps to protect your capital.
            </p>
            <ul className="text-sm text-zinc-500 space-y-1">
              <li>✓ Global & market-level kill switches</li>
              <li>✓ Position size limits</li>
              <li>✓ Loss thresholds</li>
            </ul>
          </div>
        </div>

        {/* How Arbitrage Works */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8 mb-16">
          <h2 className="text-2xl font-bold text-white mb-6">💡 How Single-Market Arbitrage Works</h2>
          
          <div className="space-y-6 text-zinc-300">
            <p>
              In a binary prediction market, the sum of YES and NO prices should equal $1.00.
              When they don&apos;t, there&apos;s an arbitrage opportunity.
            </p>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-green-400 font-bold mb-2">✅ Profitable Scenario</h3>
                <p className="text-sm mb-2">YES Ask = $0.48, NO Ask = $0.48</p>
                <p className="text-sm mb-2">Total Cost = $0.96</p>
                <p className="text-sm mb-2">Guaranteed Payout = $1.00</p>
                <p className="text-green-400 font-medium">Profit = $0.04 (4.17% ROI)</p>
              </div>
              
              <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                <h3 className="text-red-400 font-bold mb-2">❌ Loss Scenario</h3>
                <p className="text-sm mb-2">YES Ask = $0.52, NO Ask = $0.52</p>
                <p className="text-sm mb-2">Total Cost = $1.04</p>
                <p className="text-sm mb-2">Guaranteed Payout = $1.00</p>
                <p className="text-red-400 font-medium">Loss = $0.04 (-3.85% ROI)</p>
              </div>
            </div>
            
            <p className="text-zinc-400 text-sm">
              The scanner automatically detects markets where the combined ask prices are below $1.00,
              representing risk-free profit opportunities (minus fees and slippage).
            </p>
          </div>
        </div>

        {/* API Endpoints */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">🔌 API Endpoints</h2>
          
          <div className="space-y-4 font-mono text-sm">
            <div className="flex items-start gap-4 p-3 bg-zinc-800 rounded">
              <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">GET</span>
              <div>
                <code className="text-white">/api/arbitrage/scan</code>
                <p className="text-zinc-400 text-xs mt-1">Get active arbitrage opportunities</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-3 bg-zinc-800 rounded">
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">POST</span>
              <div>
                <code className="text-white">/api/arbitrage/scan</code>
                <p className="text-zinc-400 text-xs mt-1">Run a new scan for opportunities</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-3 bg-zinc-800 rounded">
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs">POST</span>
              <div>
                <code className="text-white">/api/arbitrage/execute</code>
                <p className="text-zinc-400 text-xs mt-1">Execute an arbitrage trade</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-3 bg-zinc-800 rounded">
              <span className="bg-green-600 text-white px-2 py-0.5 rounded text-xs">GET</span>
              <div>
                <code className="text-white">/api/arbitrage/history</code>
                <p className="text-zinc-400 text-xs mt-1">View historical opportunities</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 p-3 bg-zinc-800 rounded">
              <span className="bg-yellow-600 text-white px-2 py-0.5 rounded text-xs">GET/POST</span>
              <div>
                <code className="text-white">/api/arbitrage/alerts</code>
                <p className="text-zinc-400 text-xs mt-1">Check alerts / Configure alert settings</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
