---
date: 2026-11-15
author: Claude
type: feature
status: open
pr: []
features: [BKT-31]
areas: [frontend, backtest]
---

# Backtest: calibration profile from a calibration window (BKT-31, PR-4)

## Request

Plan 1114-M1 §5 and §9 (decision M1.5). The backtest timing constants were measured on one account and one VPS. A new broker or account must not make the difference grow. The profile is computed at the start of a run from a calibration window W_c and written to the run log. Nothing is stored.

## Solution

| File | Change |
|---|---|
| `calibration.ts` | Two flags, both off: `CALIBRATE_DEFAULT`, `REPLAY_LOOP_FROM_ACCOUNT_DEFAULT`. `derivedFor(opCost)`: the cluster gap and the chain slack come from a formula (`max(3·pending, 0.8)`, `max(3·max(pending, remove), 0.7)`). With the default costs it gives exactly 0.8 and 0.7. |
| `calibrationDerive.ts` | New, pure. `deriveProfile(input)`: op cost `pending`/`remove` = median gap to the next op inside a cluster (by kind of the earlier op); `headS` = median `dur − pre` of quiet turns; `zoneOverheadS`; `opCost.sltp` = slope of `z0 − snap` against `nsl0`; `clockShiftS` from `estimateClockOffset`; `fillLatencyMs` from given samples. Each value needs a minimum number of samples. If it has fewer, it stays at the default and the name goes to `fallbacks`. |
| `calibrationLoad.ts` | New. `loadCalibration`: W_c = the 3 trading days (Monday to Friday) before `from`; GET of the order history and of the turn telemetry only. An error or a gap gives the default profile, never an abort. |
| `turnSchedule.ts`, `botTurnsLoad.ts`, `runner.ts` | An optional `profile` is read for the head, op costs, cluster gap, chain slack and fill latency. Without it, `DEFAULT_PROFILE` is used and the result is the same byte for byte. `RunModel.botIntervalSec` replaces the fixed 1 s bot step in the replay. |
| `runJob.ts`, `protocol.ts`, `BacktestView.tsx` | `RunParams.calibration` (set only when the flag is on). The run loads W_c itself, or takes the profile from the page when the page needed it for the turn schedule. Log: `run.calibration` (INFO) or `run.calibrationDefault` (WARN). `REPLAY_LOOP_FROM_ACCOUNT_DEFAULT` sets `botIntervalSec` to the account LOOP, only for a run without a turn schedule. No new UI. |

Rules kept:
- W_c ends at `from` of the run. `deriveProfile` returns the default profile when `to > evalFrom`.
- Only times are measured. Profit and Σ of the evaluation window are never read.
- The run only reads the profile. No value depends on the result of the run.
- `zoneOverheadS` is measured and logged, but the schedule does not use it yet (PR-3). Using it now would count the zone reads twice, because `headS` already contains them.
- The profile has no broker or server name.

## Verification
- `npx tsc --noEmit`, `npx eslint src e2e/mocked/backtest-calibration-lib.spec.ts`: no error.
- Playwright `@BKT-30` and `@BKT-31` lib specs: all passed (11 new in `backtest-calibration-lib.spec.ts`).
- `scripts/features/precheck.sh`: worker, lint, tsc and all 3582 mocked e2e tests passed. The catalog step failed on a YAML colon in the new `erwartet` text and on the FRM-48 line already on main; both are quoted now and `update_checklist.py --check` passes.
- Acceptance measurement (GET only): the profile derived from W_c gives op cost pending 0.228-0.229 s (+3/+4 ms to the default), remove 0.103-0.105 s (+1/+3 ms); the thresholds stay 0.8 and 0.7. Σ|ΔNet| / unmatched / K4f with the flag on equals the BKT-30 baseline in every window, also per setup: P6+ 0.01/0/0, P7 1.78/0/0, NFP 57.72/4/2, telemetry window 0.00/0/0. No setup regression. In the telemetry window `headS` derived to 0.070 s (default 0.105 s); `z0`/`nsl0` were missing in W_c, so zone overhead and SLTP stay at the default with a mark.

## Open points
- [x] Default decision for the two flags (needs the measurement on a window with telemetry in W_c). The REPLAY_LOOP arm is not measured yet. (done: 2026-11-17-bkt31-calibration-default.md)
- [ ] `fillLatencyMs` is not measured by the page yet (needs ticks). It stays at the default with a mark.
