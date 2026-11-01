---
date: 2026-11-01
author: Claude
type: fix
status: done
pr: []
features: [FRM-21]
areas: [frontend, tests]
---

# Formation search restarts when a higher timeframe changes

## Request
- The full formation check (2026-11-01) found finding 44. The page can show formations that are based on old D1, H4 or H1 data.
- The user approved the plan on 2026-11-01. This entry covers package C-4 only.

## Cause
- `useFormationScan.ts` built the key of the search from the last M15 candle only.
- `useMarketRates` loads D1, H4, H1 and M15 with one 60-second timer for each.
- When M15 loads first, the search runs with the old D1, H4 and H1 data. The key stays the same until the next M15 candle. The search does not run again with the new data.
- The alarm run (`FormationScanRunner.tsx`) loads all four timeframes together. It has no fault.

## Solution
| File | Change |
|---|---|
| `src/lib/formation/scanKey.ts` | New pure function `scanSignature`. For each timeframe it joins the count of closed candles and the time of the last closed candle. The live candle is not closed. |
| `src/hooks/useFormationScan.ts` | The key of the search contains the signature. |
| `e2e/mocked/formation-scankey-lib.spec.ts` | Tests for the signature (`@FRM-21`). |
| `docs/features/features.yaml` | FRM-21 text, code list and check list. |

## Why
- A closed candle does not change after it closes. The signature changes only when a new candle closes. So there is no restart every 60 seconds.
- The live candle (`liveFrom`) is not part of the signature. Its values are provisional. After a load over the hour border, `time + duration <= at` is true for it, but its values still change at the next reload. The first version of the signature missed this case. The reviewer and the Codex scan both found it.
- A candle counts as closed when `time + duration <= at` (as in `FormationContext.closedCount`) and `time < liveFrom`.
- Gaps (`missing`) are not in the signature. The search reads candles only, and the count can change without a change of the result. Package C-5 must add gaps to the signature if gaps go into the search.
- Rejected: add the full load time of each timeframe to the key. This restarts the search every 60 seconds without a new closed candle.
- Rejected: a page test with `page.clock`. The data of the mock worker would need a timing that depends on the load order. The test of the pure function covers the cause directly.

## Verification
- Before the code: `E2E_PORT=3102 npx playwright test e2e/mocked/formation-scankey-lib.spec.ts` failed. The build did not pass (first version: `scanKey.ts` missing; fix of the live candle: type error of the new signature).
- `scripts/features/run.sh FRM`: 1137 passed, 0 failed.
- `npx tsc --noEmit` and `npx eslint` on the changed files: no output.
- The order "M15 first, H1 one minute later" in the browser is not verified. The test covers the signature, not the timer of the hook.

## Open points
None.
