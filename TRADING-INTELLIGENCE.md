# Trading Intelligence Strategy

## Overview

The Trading Intelligence layer is a five-service pipeline that discovers opportunities on Kalshi prediction markets, sizes bets using probability models, enforces disciplined thesis-driven trading, tracks P&L in real-time, and computes portfolio-level performance metrics.

```
Market Data (WebSocket)
    |
    v
ForecastingService --> generates probability + edge + Kelly size
    |
    v
ThesisService --> wraps it in a falsifiable hypothesis
    |
    v
ArbitrageService --> separately scans for risk-free opportunities
    |
    v
Orders placed through Core Services (Pre-Trade -> Order State Machine -> Kalshi API)
    |
    v
DailyPnLService --> tracks every fill and MTM update -> triggers kill switch if limits breached
    |
    v
AnalyticsService --> aggregates into daily snapshots, Sharpe, Sortino, win rate
```

---

## 1. Arbitrage Detection

**Service:** `ArbitrageService.ts`

Exploits a fundamental property of Kalshi's binary contracts: YES + NO must pay out exactly $1.00. If you can buy both for less than $1.00, the difference is guaranteed profit.

### How It Works

1. `scanForOpportunities()` paginates through every open market on Kalshi
2. For each market, `analyzeMarket()` checks: `yesAsk + noAsk < 100`
3. If true, the profit is `100 - (yesAsk + noAsk)` cents per contract, risk-free
4. Opportunities are persisted to the database with status `ACTIVE`
5. Stale opportunities (not seen for 5 minutes) are auto-expired

### Execution

`executeOpportunity()` places two simultaneous limit orders -- one buying YES, one buying NO -- at the ask prices. If both fill, the profit is locked in regardless of outcome.

### Example

- YES ask = 47 cents, NO ask = 51 cents
- Buy both for 98 cents, guaranteed payout of $1.00
- Profit = 2 cents/contract

### Thresholds

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MIN_PROFIT_CENTS` | 0.5 | Minimum profit in cents to track |
| `MIN_PROFIT_PERCENT` | 0.5 | Minimum profit percentage to track |

### Opportunity Lifecycle

```
ACTIVE --> EXECUTED (both legs filled)
       --> EXPIRED  (not seen for 5 minutes)
       --> MISSED   (execution failed)
```

---

## 2. Forecasting (Ensemble + Kelly Criterion)

**Service:** `ForecastingService.ts`

Answers two questions: "Is this market mispriced?" and "How much should I bet?"

### Forecast Models

Three models run independently, then combine via ensemble:

| Model | Logic | Confidence Driver |
|-------|-------|-------------------|
| **Baseline** | Market mid-price + 5% mean reversion toward 50% | High volume, tight spread |
| **Mean Reversion** | Stronger fade on extreme prices (15% reversion if >80% or <20%) | Price distance from 50%, time until expiration |
| **Volume-Weighted** | Trusts high-volume prices, applies more reversion to low-volume markets | Scales linearly with volume up to 5000/day |

### Ensemble Model

Runs all three models, takes a confidence-weighted average of their probability predictions. If models agree (low standard deviation across predictions), confidence gets a bonus. If they disagree, confidence drops.

### Edge Calculation

```
edge = modelProbability - marketAskProbability
```

If edge exceeds the `minEdgeToTrade` threshold (default 3%), the market is considered tradeable.

### Kelly Criterion Sizing

Determines optimal bet size using the Kelly formula:

```
f* = (bp - q) / b

where:
  b = (1 - marketProbability) / marketProbability   (odds received)
  p = winProbability                                 (model's estimate)
  q = 1 - p                                         (probability of losing)
```

Three safety caps are applied:
1. Multiplied by confidence (uncertain predictions bet less)
2. Capped at 25% Kelly (quarter Kelly maximum)
3. Capped at 10% of bankroll per position

### Signal Strength Classification

| Strength | Criteria |
|----------|----------|
| **Strong** | Edge >= 10% AND confidence >= 70% |
| **Moderate** | Edge >= 5% AND confidence >= 60% |
| **Weak** | Edge >= 3% AND confidence >= 55% |
| **None** | Below thresholds |

### Bet Size Recommendation

| Signal | Kelly Fraction |
|--------|---------------|
| Strong + confidence >= 80% | Full Kelly |
| Strong | Half Kelly |
| Moderate | Quarter Kelly |
| Weak | Quarter Kelly |

### Default Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minEdgeToTrade` | 0.03 | 3% minimum edge |
| `minConfidence` | 0.55 | 55% minimum confidence |
| `bankroll` | $1,000 | Default bankroll |
| `maxKellyFraction` | 0.25 | Quarter Kelly maximum |
| `maxPositionPercent` | 0.10 | 10% max per position |
| `minVolume24h` | 100 | Minimum 24h volume |
| `minOpenInterest` | 50 | Minimum open interest |
| `maxSpreadPercent` | 0.15 | 15% max spread |
| `minDaysToExpiration` | 0.5 | At least 12 hours to expiration |

### Example Output

> Model predicts 65% vs market 55% (10% edge). Confidence: 72%. Recommend YES. Quarter Kelly = $47.

---

## 3. Thesis Tracking

**Service:** `ThesisService.ts`

Enforces the discipline that every trade must have a documented reason that can be proven wrong.

### Thesis Structure

| Field | Description |
|-------|-------------|
| `hypothesis` | Text explanation (e.g., "Market underprices YES due to recency bias") |
| `direction` | `yes` or `no` |
| `targetPrice` | Fair value estimate in cents |
| `confidence` | 0-1 probability estimate |
| `falsificationCriteria` | What would prove the thesis wrong |
| `edgeRequired` | Minimum edge in cents to trigger a trade (default 2 cents) |
| `maxPrice` | Ceiling price -- don't buy above this |
| `modelId` / `modelVersion` | Which forecast model produced this thesis |
| `evidenceLinks` | Supporting data references |

### Thesis Lifecycle

```
ACTIVE --> EXECUTED    (trade placed based on this thesis)
       --> INVALIDATED (falsification criteria met)
       --> EXPIRED     (past expiration date)
       --> SUPERSEDED  (new thesis replaced it for the same market)
```

### Trade Signal Evaluation

`evaluateThesis()` compares current market price against the thesis and returns a trade signal only if all four conditions are met:

1. Edge >= required edge (`targetPrice - currentPrice >= edgeRequired`)
2. Price <= max price
3. Thesis is still `ACTIVE`
4. Thesis has not expired

If any condition fails, the evaluation returns a reason string explaining why no trade was triggered.

### Model Calibration

After market settlement, `recordPerformance()` calculates a Brier score:

```
brierScore = (predictedProbability - actualOutcome)^2
```

`getModelCalibration()` aggregates Brier scores by model ID, producing:
- Average Brier score (lower is better, target < 0.20)
- Directional accuracy (did we predict the right side?)
- Total predictions count

This feedback loop tells you which forecasting model is actually calibrated over time.

---

## 4. Daily P&L

**Service:** `DailyPnLService.ts`

Tracks profit and loss in real-time and automatically triggers the kill switch when losses exceed limits.

### Update Types

| Type | What It Records |
|------|----------------|
| `fill` | Trade count, fees |
| `position_close` | Realized P&L, win/loss classification |
| `mark_to_market` | Unrealized P&L for all open positions |

### P&L Calculation

On every update:

```
grossPnl = realizedPnl + unrealizedPnl
netPnl   = grossPnl - fees
drawdown = peakPnl - netPnl
```

The peak P&L (high water mark) is tracked and updated whenever `netPnl` exceeds the previous peak.

### Automatic Kill Switch Triggers

| Condition | Default Threshold | Action |
|-----------|-------------------|--------|
| Daily loss limit | $500 | `KillSwitchLevel.GLOBAL` triggered |
| Drawdown limit | 10% from peak | `KillSwitchLevel.GLOBAL` triggered |

When either threshold is breached, the service calls `killSwitchService.trigger()` which halts all trading system-wide.

### Risk Status Monitoring

`getRiskStatus()` returns utilization percentages for the dashboard:

```
dailyLossUtilization = currentLoss / maxDailyLoss
drawdownUtilization  = currentDrawdown / maxDrawdown
```

Warnings are emitted when utilization exceeds 80%.

### Default Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxDailyLoss` | $500 | Max loss before kill switch |
| `maxDrawdown` | 10% | Max drawdown from peak before kill switch |
| `killSwitchEnabled` | true | Whether to auto-trigger kill switch |

---

## 5. Analytics

**Service:** `AnalyticsService.ts`

Provides portfolio-level performance reporting and advanced risk-adjusted metrics.

### Daily Snapshots

`createDailySnapshot()` records a daily picture of the portfolio:

- Portfolio value, cash balance, position value
- Realized and unrealized P&L
- High water mark and drawdown (calculated against all previous snapshots)
- Open/closed position counts

`captureSnapshot()` can auto-capture using a portfolio data provider connected to the Kalshi API.

### Trade Lifecycle

| Method | Purpose |
|--------|---------|
| `recordTradeEntry()` | Records a new position opening |
| `updateTradePrice()` | Updates unrealized P&L with current market price |
| `closeTrade()` | Records exit, calculates realized P&L, classifies as WIN/LOSS/BREAKEVEN |

### Win/Loss Statistics

`calculateStats()` computes comprehensive metrics with time filtering (7d, 30d, 90d, all):

**Basic Metrics:**
- Win rate, win count, loss count, breakeven count
- Total/average P&L, largest win, largest loss

**Advanced Metrics:**

| Metric | Formula | What It Measures |
|--------|---------|-----------------|
| **Profit Factor** | Gross profit / gross loss | How much you win per dollar lost |
| **Expectancy** | (winRate x avgWin) - (lossRate x avgLoss) | Expected profit per trade |
| **Sharpe Ratio** | (annualizedReturn - riskFreeRate) / annualizedStdDev | Risk-adjusted return (assumes 252 trading days, 5% risk-free rate) |
| **Sortino Ratio** | (annualizedReturn - riskFreeRate) / annualizedDownsideDev | Same as Sharpe but only penalizes downside volatility |
| **Max Drawdown** | Largest peak-to-trough decline | Worst historical loss from a high point |

**Holding Period:**
- Average holding days (all trades, wins only, losses only)

### Sharpe Ratio Calculation

```
1. Calculate daily returns from portfolio snapshots
2. dailyReturn = (todayValue - yesterdayValue) / yesterdayValue
3. annualizedReturn = avgDailyReturn x 252
4. annualizedStdDev = dailyStdDev x sqrt(252)
5. sharpe = (annualizedReturn - 0.05) / annualizedStdDev
```

### Sortino Ratio Calculation

Same as Sharpe, but standard deviation only includes days with returns below the risk-free rate (downside deviation). This avoids penalizing upside volatility.

---

## Service Interactions

```
                    +-------------------+
                    |   WebSocket Data  |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
              v                             v
   +--------------------+       +---------------------+
   | ForecastingService |       |  ArbitrageService   |
   | - 3 models + ensemble|     | - Scans YES+NO < $1 |
   | - Edge calculation  |       | - Executes both legs|
   | - Kelly sizing      |       +----------+----------+
   +----------+----------+                  |
              |                             |
              v                             |
   +--------------------+                   |
   |   ThesisService    |                   |
   | - Falsifiable hypo |                   |
   | - Trade evaluation |                   |
   | - Model calibration|                   |
   +----------+----------+                  |
              |                             |
              +-------------+---------------+
                            |
                            v
              +----------------------------+
              |    Core Services           |
              | Pre-Trade -> Order SM ->   |
              | Kalshi API                 |
              +-------------+--------------+
                            |
                            v
              +----------------------------+
              |    DailyPnLService         |
              | - Tracks fills + MTM       |
              | - Kill switch on loss limit|
              +-------------+--------------+
                            |
                            v
              +----------------------------+
              |    AnalyticsService         |
              | - Daily snapshots          |
              | - Sharpe, Sortino, PF      |
              | - Win rate, expectancy     |
              +----------------------------+
```
