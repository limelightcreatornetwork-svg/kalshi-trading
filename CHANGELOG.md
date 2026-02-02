# Changelog

All notable changes to the Kalshi Trading Platform are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] - 2026-02-02

### Added

#### Core Infrastructure
- **Kalshi API Client** (`src/lib/kalshi.ts`)
  - RSA-PSS signature authentication
  - Request timeout (30s default)
  - Retry logic with exponential backoff for transient failures
  - Support for demo and production environments

- **WebSocket Service** (`src/services/KalshiWebSocketService.ts`)
  - Real-time portfolio updates (fills, orders, positions)
  - Market data streaming (orderbook, ticker, trades)
  - Automatic reconnection with exponential backoff
  - Event-based architecture with typed handlers

- **Structured Logging** (`src/lib/logger.ts`)
  - JSON-formatted logs with timestamps
  - Separate loggers for API, WebSocket, and general use
  - Configurable log levels

#### Trading Services
- **Order State Machine** (`src/services/OrderStateMachine.ts`)
  - Complete order lifecycle tracking
  - Valid state transition enforcement
  - Fill processing with average price calculation

- **Idempotency Service** (`src/services/IdempotencyService.ts`)
  - Deterministic key generation
  - Request deduplication with TTL
  - Conflict detection for key reuse

- **Thesis Service** (`src/services/ThesisService.ts`)
  - Evidence-based trade thesis creation
  - Falsification criteria tracking
  - Market condition evaluation
  - Performance recording and calibration

#### Risk Management
- **Kill Switch Service** (`src/services/KillSwitchService.ts`)
  - Hierarchical trading halt (global → strategy → market → account)
  - Automatic triggers based on thresholds
  - Manual reset with audit trail

- **Position Cap Service** (`src/services/PositionCapService.ts`)
  - Per-market position limits
  - Risk tier multipliers
  - Soft/hard cap warnings

- **Pre-Trade Check Service** (`src/services/PreTradeCheckService.ts`)
  - Comprehensive pre-order validation
  - Kill switch integration
  - Position cap enforcement

- **Daily P&L Service** (`src/services/DailyPnLService.ts`)
  - Real-time P&L tracking
  - Fill aggregation
  - Daily/weekly/monthly summaries

#### Analysis & Strategy
- **Forecasting Service** (`src/services/ForecastingService.ts`)
  - Multiple probability models:
    - Baseline (mean reversion)
    - Volume-Weighted
    - Mean Reversion
    - Ensemble (combines all models)
  - Kelly criterion bet sizing
  - Edge opportunity detection
  - Confidence-adjusted recommendations

- **Arbitrage Service** (`src/services/ArbitrageService.ts`)
  - Single-market arbitrage detection (YES + NO < $1)
  - Opportunity tracking and alerting
  - Execution with order placement

- **Strategy Registry** (`src/services/StrategyRegistry.ts`)
  - Pluggable strategy framework
  - Lifecycle management
  - Performance tracking

- **Value Strategy** (`src/services/strategies/ValueStrategy.ts`)
  - Fair value estimation
  - Signal generation with edge thresholds
  - Configurable aggressiveness

#### Security
- **Secrets Service** (`src/services/SecretsService.ts`)
  - AES-256-GCM encryption for credentials
  - Scope-based access control
  - Key masking for logs

#### API Routes
- `GET /api/balance` - Account balance
- `GET /api/positions` - Current positions
- `GET /api/portfolio` - Portfolio summary
- `GET /api/orders` - Order history
- `POST /api/orders` - Place order
- `DELETE /api/orders/[orderId]` - Cancel order
- `GET /api/markets` - List markets
- `GET /api/forecasting` - Edge opportunities
- `GET /api/arbitrage/scan` - Scan for arbitrage
- `GET /api/arbitrage/scan-live` - Live arbitrage scan
- `POST /api/arbitrage/execute` - Execute arbitrage
- `GET /api/arbitrage/history` - Opportunity history
- `GET /api/arbitrage/alerts` - Alert configuration
- `GET /api/health` - Health check
- `GET /api/dashboard/risk` - Risk metrics
- `GET /api/dashboard/performance` - Performance metrics
- `POST /api/dashboard/killswitch` - Kill switch control

#### Dashboard UI
- Risk management dashboard
- Performance tracking dashboard
- Arbitrage scanning interface
- Forecasting visualization

#### Testing
- 304 comprehensive tests across 12 test files
- ~73% statement coverage
- Mocked external dependencies
- In-memory storage implementations for unit tests

### Fixed
- RSA private key PEM formatting for Kalshi authentication
- Environment variable trimming and validation
- Rate limiting with response caching
- Misleading P&L variable naming in risk dashboard
- Invalid win/loss calculation logic in performance dashboard
- Type safety improvements in order creation

### Changed
- Migrated from legacy class-based API client to functional exports
- Removed duplicate type definitions
- Updated to Next.js 16 and React 19
- Standardized on Prisma 7 for database

### Security
- All API credentials encrypted at rest
- RSA-PSS authentication for Kalshi API
- No secrets in logs (masked output)

---

## Development Cycles

| Cycle | Focus | Key Changes |
|-------|-------|-------------|
| 1 | Analysis | Initial codebase setup, API integration |
| 2 | Reliability | Request timeout and retry logic |
| 3 | Type Safety | Removed duplicate types, fixed casts |
| 4 | Testing | 22 tests for kalshi.ts (3.4% → 82.35%) |
| 5 | Bug Fix | Fixed P&L variable naming |
| 6 | Bug Fix | Fixed win/loss calculation |
| 7 | Review | WebSocket service validation |
| 8 | Logging | Structured logging system |
| 9 | Infrastructure | Health check endpoint |
| 10 | Features | Forecasting service with Kelly sizing |
| 11 | Testing | 304 total tests, comprehensive coverage |
| 12 | Documentation | README and CHANGELOG |

---

## Roadmap

### Planned Features
- [ ] Real-time unrealized P&L calculation
- [ ] Per-trade P&L tracking for win/loss stats
- [ ] Rate limiting handler with queue
- [ ] Request/response logging middleware
- [ ] Mobile-responsive dashboard
- [ ] Email/SMS alerts for opportunities
- [ ] Backtesting framework
- [ ] Multi-account support

### Known Issues
- ArbitrageService database methods need additional test coverage
- StrategyRegistry coverage at 25%
- API route handlers not fully tested
