---
date: 2026-11-06
author: Claude
type: decision
status: done
pr: []
features: [BKT-16]
areas: [frontend]
---

# BT-Live K3: proportional exit-reason limit

## Request
In the BT-Live comparison, K3 (exit reason) must allow a small share of pairs with a different reason. The owner approved a proportional limit.

## Cause
K3 passed only with zero differences. It did not scale with the trade count. In window 4, one symbol failed with 5 differences in 314 pairs, and another with 1 in 129 pairs. A M1 candle does not show whether SL or TP came first inside one minute, so a few differences are expected. The owner does not count a small share in a weekly or monthly window as a problem.

## Solution

| File | Change |
|---|---|
| `src/lib/backtest/liveCompare.ts` | K3 passes when `reasonMismatches <= floor(ratio × pairs)`. The ratio is the option `reasonMismatchRatio` of `evaluateBtLive` (default `K3_REASON_MISMATCH_RATIO = 0.02`). The result carries the limit as `reasonMismatchLimit` |
| `e2e/mocked/backtest-live-compare-lib.spec.ts` | New test: 5 of 314 pass, 3 of 129 fail, 1 of 49 fails |
| `docs/features/features.yaml` | BKT-16 text updated |

## Why
Below 50 pairs the formula gives 0, so small samples stay strict. This is a deliberate choice. A fixed ratio in the code was rejected: the ratio is an option, like the other limits.
No UI shows this result yet (`evaluateBtLive` is used only in the library and its tests), so no UI text changed.

## Verification
See the PR: new test red first, then green; `scripts/features/precheck.sh`.
