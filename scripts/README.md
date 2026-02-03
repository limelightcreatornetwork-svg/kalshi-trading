# Kalshi Trading Scripts

Utility scripts for interacting with the Kalshi prediction market API. These scripts were used for Super Bowl LX analysis and trading.

## Scripts

### Account & Order Management

| Script | Description |
|--------|-------------|
| `check-orders.ts` | Check account balance, open orders, filled orders, and current positions. Uses the shared kalshi library. |
| `check-status.ts` | Direct API calls to check account status, specific order details, and positions. |
| `final-status.ts` | Check Super Bowl bet order status and market details for a specific ticker. |

### Market Search & Analysis

| Script | Description |
|--------|-------------|
| `deep-search.ts` | Paginate through all markets to find NFL/Super Bowl related markets. Groups by event and shows high volume markets. |
| `find-superbowl.ts` | Comprehensive event and market search for Super Bowl LX. Searches events API and filters by sports terms. |
| `find-superbowl-best.ts` | Find best Super Bowl LX markets (Seahawks vs Patriots) sorted by liquidity and spread. |
| `superbowl-search.ts` | Comprehensive keyword-based search across all markets for Super Bowl terms. Groups by event ticker. |
| `sb-events-search.ts` | Search events and series APIs for Super Bowl. Differentiates simple markets from multi-leg parlays. |
| `search-all-sports.ts` | Search all sports/MVP/game-related markets. Includes MVE (Multi-Event) sports markets analysis. |

### Betting & Execution

| Script | Description |
|--------|-------------|
| `execute-bet.ts` | Full bet execution script with Kelly criterion analysis, fair value estimation, and order placement. |
| `find-best-bet.ts` | Find best tradeable bets by analyzing orderbook depth and market liquidity. |
| `superbowl-analysis.ts` | Super Bowl LX market analysis with balance check, event search, and automated betting on New England. |

## Usage

Run any script with `npx tsx`:

```bash
npx tsx scripts/check-orders.ts
npx tsx scripts/deep-search.ts
```

## API Authentication

Most scripts embed API credentials directly. The `check-orders.ts` script imports from the shared `src/lib/kalshi` library.

## Notes

- All scripts use the Kalshi Elections API (`api.elections.kalshi.com`)
- Markets are priced in cents (¢)
- Volume represents number of contracts traded
- Spread = ask - bid (lower is better liquidity)
