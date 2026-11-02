---
date: 2026-11-02
author: Claude
type: feature
status: done
pr: []
features: [FRM-34, FRM-19, FRM-07, FRM-12]
areas: [frontend, tests]
---

# The browser builds W1 candles from D1

## Request
- Finding 16 of package D: GAR-19 never reached "met" and CYP-02 on D1 was never measurable, because the context had no weekly timeframe.
- The user chose variant A on 2026-11-02: the browser builds W1 from D1. W1 serves only trend, RSI and divergence. No fractal zones on W1 (FRZ-27).

## Solution
| File | Change |
|---|---|
| `lib/formation/weekly.ts` (new) | `weeklyFromDaily`: a week starts on Sunday 00:00 broker time (as MT5 W1). A D1 candle on Sunday belongs to the new week. A missing D1 range in or before a week sets `gapBefore`. `splitDaily` keeps the last 400 days for D1 and builds W1 from all days. `W1_HISTORY_DAYS = 1100` (assumption). |
| `lib/formation/params.ts` | New type `TrendTimeframe = 'W1' \| ContextTimeframe`; `D1_VIEW_DAYS = 400`. `CONTEXT_TIMEFRAMES` is unchanged. |
| `lib/formation/context.ts` | The input may carry `W1`. It gets RSI, wave and ATR like every timeframe. `timeframes()` does not list W1, so there are no fractal zones and no search on W1. The running week is closed only after `time + 7 days`. |
| `lib/formation/reasons.ts` | `buildEnv` adds the W1 view and trend (no Fibonacci). New `higherTrendTf`: W1 above D1, otherwise `neighborTf`. `neighborTf` is unchanged. |
| `lib/formation/xabcd.ts` | GAR-19 reads the W1 divergence instead of a `null` placeholder. `closedBeyondX` reads the bar length from the timeframe it uses. |
| `lib/formation/cypChecks.ts` | CYP-02 uses `higherTrendTf`: on D1 it measures against the W1 trend. |
| `lib/formation/settle.ts` | The CYP-02 exemption on D1 is removed. `exemptFor(code, checks)` loses the unused `tf` parameter; all callers changed. |
| `lib/formation/trdFormation.ts` | The trend of a W1 view carries the label `D1`. The label only drives the zone geometry (manipulation is H4 only). |
| `requests.ts`, `FormationScanRunner.tsx`, `hooks/useFormationScan.ts` | D1 requests 1100 days; `splitDaily` cuts the D1 view and builds W1. A gap only in the extra part does not set the favorites gap note. |
| `docs/features/features.yaml` | New `FRM-34`; the FRM-07 and FRM-19 texts no longer say "GAR-19 without W1" and "CYP-02 on D1 exempt". |
| `e2e/mocked/formation-w1-lib.spec.ts` (new) and `formation-gar-bat-lib`, `formation-cyp-lib`, `formation-settle-lib` specs | New tests (see below). |

## Why
- Variant A and not a worker change: the worker stays as it is; D1 already has all data for W1.
- `neighborTf` stays without W1. A change there would also alter Fibonacci, signal, engulfing, double top and ABCD checks on D1. Finding 16 names only GAR-19 and CYP-02. G1 (higher trend, reasons) is not changed for the same reason.
- 1100 days is an assumption: wave needs 35 weeks, so about 120 weeks have values.

## Decision
- **Decision:** W1 is built from D1 in the browser and is not a context timeframe.
- **Changed expectation:** a Cypher on D1 without W1 data was "valid" through the exemption. Now it is "forming" (CYP-02 is unmeasurable). This follows from the decision A. No other expectation was relaxed.
- **Cost (Bedel):** D1 loads 1100 instead of 400 days; the scan reads about 2.7 times more D1 candles.
- **Revisit (Yeniden bak):** if weeks built from D1 differ from real MT5 W1 data (for example a broker with Monday week start), check variant B.

## Verification
- Red before the code: `formation-w1-lib.spec.ts` (view of W1 in the context), GAR-19 cases "W1 divergence met" and "W1 without divergence unmet" (both were `unmeasurable`).
- Green after: `E2E_PORT=3217 scripts/features/run.sh FRM`: 1266 passed, 0 failed (api: 17 passed). `tsc --noEmit` and `eslint` clean.
- Changed page test: "Cypher auf D1" (FRM-19) asserted the old exemption. It now expects a valid hit with CYP-02 measured against W1. Its D1 candles now end on the current broker day, because the page shows only the last 400 days of D1.
- One FRM run had three timing failures in the alarm tests (FRM-27) while another job ran. They passed alone and in the next full run.

## Known limit
- The oldest W1 candle can be partial: the 1100-day window may start inside a week. The effect on RSI and wave is small. It can matter only if that candle is a pivot.
