# Kalshi Trading Platform - Improvement Backlog

## Priority Legend
- **P0**: Critical - Security/Data integrity issues
- **P1**: High - Bugs, reliability issues
- **P2**: Medium - Code quality, testing
- **P3**: Low - Nice to have improvements

---

## Backlog Items

### Pending

#### P1 - High Priority
- [ ] **KALSHI-001**: Add tests for kalshi.ts API client (3.4% coverage)
- [ ] **KALSHI-002**: Add request timeout to prevent hanging requests
- [ ] **KALSHI-003**: Add retry logic with exponential backoff for transient failures

#### P2 - Medium Priority
- [ ] **KALSHI-004**: Remove duplicate type definitions (Market/KalshiMarket, Order/KalshiOrder)
- [ ] **KALSHI-005**: Remove legacy KalshiClient class or consolidate
- [ ] **KALSHI-006**: Replace console.log with proper logging
- [ ] **KALSHI-007**: Fix type cast bypass on line 328 (order as unknown)
- [ ] **KALSHI-008**: Add tests for ArbitrageService (17.56% coverage)
- [ ] **KALSHI-009**: Add tests for StrategyRegistry (25.35% coverage)
- [ ] **KALSHI-010**: Add API route handler tests

#### P3 - Low Priority
- [ ] **KALSHI-011**: Add request/response logging with configurable levels
- [ ] **KALSHI-012**: Add rate limiting handling for API calls

---

## In Progress

_None_

---

## Completed

_Items will be moved here after implementation_

---

## Improvement Cycle Log

| Cycle | Date | Focus | Changes Made |
|-------|------|-------|--------------|
| 1 | 2026-02-02 | Analysis | Initial codebase analysis, coverage assessment |
