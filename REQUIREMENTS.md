# Kalshi Trading System — Strategy & System Requirements

*Compiled 2026-02-02*

---

## A. Strategy & Alpha Requirements

### A1) Signal Quality Upgrades

1. **Signal provenance tracking** — Know where every signal came from
2. **Deduplication & story clustering** — Don't double-count the same news
3. **Source reliability scoring** — Weight signals by source accuracy
4. **Surprise metric** — Measure how unexpected news is vs priors

### A2) Probability Modeling Upgrades

5. **Market-implied probability** — Extract probabilities from current prices
6. **Calibrated probability model** — Ensure predicted probabilities match outcomes
7. **Time-to-expiry modeling** — Adjust for contract lifecycle
8. **News → probability delta mapping** — Quantify how news moves probabilities

### A3) New Strategies

9. **Cross-market consistency / no-arb** — Exploit pricing inconsistencies across related markets
10. **Liquidity maker vs taker** — Different approaches based on spread/depth
11. **Momentum with regime filter** — Follow trends only when regime supports
12. **Event-driven playbooks** — Pre-defined responses to known event types

---

## B. Execution Engine Requirements

13. **Single decision loop** — One unified loop for all decisions
14. **Idempotent order placement** — No duplicate orders ever
15. **Order lifecycle state machine** — Track every state transition
16. **Smart cancel/replace** — Efficient order amendments
17. **WebSocket-first data** — Real-time over polling
18. **Circuit breaker** — Automatic pause on anomalies

---

## C. Risk & Portfolio

19. **Per-market caps** — Position limits per market
20. **Correlation-aware caps** — Don't over-concentrate in correlated markets
21. **Slippage modeling** — Account for execution costs
22. **Kill switch hierarchy** — Multiple levels of emergency stops
23. **Fractional Kelly** — Size by edge with safety margin
24. **Uncertainty-aware sizing** — Smaller size when less confident

---

## D. Analytics & Learning

25. **Brier by segment** — Score accuracy by market type, time, etc.
26. **Edge attribution** — Which signals actually make money
27. **Replay system** — Test strategies against historical data
28. **Auto thesis** — Generate hypotheses from patterns
29. **Lessons learned classifier** — Categorize and learn from mistakes

---

## E. Compliance & Ops

30. **Secrets isolation** — API keys never exposed to frontend
31. **Permissioning** — Role-based access control
32. **Policy guardrails** — Hard limits that can't be overridden
33. **Paper trading & backtesting** — Test before live
34. **Monitoring & alerts** — Know when things go wrong

---

## F. Dashboard

35. **"Are we safe?" screen** — Risk status, exposure, kill switch state
36. **"Are we good?" screen** — PnL, strategy performance, edge metrics

---

## Implementation Priority

### Tier 1 (Foundation)
- Order lifecycle state machine (#15)
- Idempotent order placement (#14)
- Kill switch hierarchy (#22)
- Per-market caps (#19)
- Secrets isolation (#30)

### Tier 2 (Edge)
- Signal provenance tracking (#1)
- Market-implied probability (#5)
- Single decision loop (#13)
- Fractional Kelly (#23)
- Brier by segment (#25)

### Tier 3 (Scale)
- Cross-market consistency (#9)
- Correlation-aware caps (#20)
- Replay system (#27)
- Auto thesis (#28)
- Event-driven playbooks (#12)
