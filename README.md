# Kalshi Trading Platform

A production-ready trading platform for [Kalshi](https://kalshi.com), the first CFTC-regulated prediction market in the US. Built with Next.js 16, TypeScript, and Prisma.

## Features

### Core Trading
- **Kalshi API Client** - Full REST API integration with RSA-PSS authentication
- **WebSocket Service** - Real-time portfolio and market data streaming
- **Order State Machine** - Complete order lifecycle management
- **Idempotency Service** - Duplicate order prevention

### Risk Management
- **Kill Switch Service** - Hierarchical emergency trading halt (global, strategy, market, account)
- **Position Cap Service** - Per-market position limits with soft/hard caps
- **Pre-Trade Check Service** - Comprehensive validation before order submission
- **Daily P&L Tracking** - Real-time profit/loss monitoring

### Strategy & Analysis
- **Thesis Service** - Evidence-based trading with falsification criteria
- **Forecasting Service** - Multiple probability models with Kelly criterion sizing
  - Baseline, Mean Reversion, Volume-Weighted, Ensemble models
  - Edge detection and opportunity ranking
- **Arbitrage Detection** - Scans for pricing inefficiencies (YES+NO < $1)
- **Strategy Registry** - Pluggable trading strategy framework

### Security
- **Secrets Service** - AES-256-GCM encrypted credential storage
- **Scope-based Access Control** - API key permission management

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Database**: Prisma ORM (SQLite/PostgreSQL)
- **Testing**: Vitest with 304+ tests
- **Styling**: Tailwind CSS 4

## Getting Started

### Prerequisites

- Node.js 20+
- Kalshi API credentials ([Get API keys](https://kalshi.com/settings/api))

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/kalshi-trading.git
cd kalshi-trading

# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push
```

### Configuration

Create a `.env.local` file with your Kalshi credentials:

```env
# Kalshi API Credentials
KALSHI_API_KEY_ID=your-api-key-id
KALSHI_API_PRIVATE_KEY=your-rsa-private-key

# Environment: 'demo' or 'production'
KALSHI_ENV=demo

# Database (optional, defaults to SQLite)
DATABASE_URL="file:./dev.db"

# Encryption key for secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SECRETS_ENCRYPTION_KEY=your-64-char-hex-key
```

### Running the Application

```bash
# Development server
npm run dev

# Production build
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## API Endpoints

### Portfolio
- `GET /api/balance` - Account balance and portfolio value
- `GET /api/positions` - Current positions
- `GET /api/portfolio` - Full portfolio summary
- `GET /api/orders` - Order history
- `DELETE /api/orders/[orderId]` - Cancel order

### Markets
- `GET /api/markets` - List markets with filtering

### Trading
- `POST /api/orders` - Place new order
- `GET /api/forecasting` - Get edge opportunities

### Arbitrage
- `GET /api/arbitrage/scan` - Scan for arbitrage
- `POST /api/arbitrage/execute` - Execute arbitrage trade
- `GET /api/arbitrage/history` - Opportunity history

### System
- `GET /api/health` - Health check
- `GET /api/dashboard/risk` - Risk metrics
- `GET /api/dashboard/performance` - Performance metrics
- `POST /api/dashboard/killswitch` - Trigger/reset kill switch

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

Current test coverage:
- **304 tests** across 12 test files
- ~73% statement coverage
- All core services have comprehensive test suites

## Architecture

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API route handlers
│   ├── dashboard/         # Dashboard UI
│   ├── arbitrage/         # Arbitrage UI
│   └── forecasting/       # Forecasting UI
├── lib/                   # Core utilities
│   ├── kalshi.ts         # Kalshi API client
│   ├── logger.ts         # Structured logging
│   ├── market-utils.ts   # Market calculations
│   └── prisma.ts         # Database client
├── services/              # Business logic
│   ├── ArbitrageService.ts
│   ├── DailyPnLService.ts
│   ├── ForecastingService.ts
│   ├── IdempotencyService.ts
│   ├── KalshiWebSocketService.ts
│   ├── KillSwitchService.ts
│   ├── OrderStateMachine.ts
│   ├── PositionCapService.ts
│   ├── PreTradeCheckService.ts
│   ├── SecretsService.ts
│   ├── StrategyRegistry.ts
│   ├── ThesisService.ts
│   └── strategies/
│       ├── BaseStrategy.ts
│       └── ValueStrategy.ts
├── types/                 # TypeScript definitions
└── components/            # React components
```

## Key Services

### KalshiWebSocketService
Real-time data streaming with automatic reconnection:
```typescript
const ws = createKalshiWebSocketService();
ws.on('fill', (fill) => console.log('Fill received:', fill));
ws.on('portfolio:update', (pos) => console.log('Position:', pos));
await ws.connect();
ws.subscribe({ channel: 'fills' });
```

### ForecastingService
Generate probability forecasts and find edge:
```typescript
const forecaster = createForecastingService({ bankroll: 10000 });
const forecast = await forecaster.generateForecast(market, 'ensemble-v1');
const opportunities = await forecaster.findEdgeOpportunities(markets);
```

### KillSwitchService
Emergency trading halt:
```typescript
const killSwitch = createKillSwitchService();
await killSwitch.emergencyStop('user123', 'Market anomaly detected');
// Check before any trade
const check = await killSwitch.check({ marketId: 'BTCUSD', strategyId: 'momentum' });
if (check.isBlocked) {
  console.log('Trading halted:', check.blockingSwitch);
}
```

## Deployment

The project is configured for Vercel deployment:

```bash
# Deploy to Vercel
vercel

# Or use the Vercel Dashboard
# https://vercel.com/new
```

Environment variables must be configured in your Vercel project settings.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is proprietary. All rights reserved.

## Disclaimer

This software is for educational and research purposes. Trading prediction markets involves risk of loss. Always use the demo environment for testing. The authors are not responsible for any financial losses incurred through use of this software.
