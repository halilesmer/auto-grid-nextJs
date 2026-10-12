---
date: 2026-10-11
author: Codex
type: fix
status: done
pr: [151]
features: [ANA-11]
areas: [tests, docs]
---

# Make the chart weekend test deterministic

## Request

- Find and repair the failed chart test that blocks PR 151.

## Cause

| Item | Evidence |
|---|---|
| CI failure | `analysis-chart.spec.ts` expected at least four market pauses, but the chart reported three. |
| Test input | The test used the current date and the relative last 30 days. |
| Root cause | A weekend counts as a market pause only between two real candles. Boundary weekends do not meet this condition. |
| Reproduction | A fixed Saturday-to-Sunday period reproduced the failure with the old assertion: 11 tests passed and one failed. |

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/e2e/mocked/analysis-chart.spec.ts` | Use two fixed periods and a fixed missing range. Assert the exact pause count for each period. |
| `docs/features/features.yaml` | Record both regression cases under ANA-11. |
| `docs/features/results.json`, `docs/features/FEATURES.md` | Regenerate with the feature runner. |

## Why

The chart follows the specification: market pauses occur between real candles. The original assertion assumed every 30-day period contains four such gaps.
The new cases separate internal weekends from boundary weekends. They preserve the checks for missing data, candle counts and display controls.
The expected counts come from the calendar, not from the chart output. No application code or mock behavior changed.
PR 150 independently fixed the original test with a fixed January period. Its merge caused a conflict in PR 151.
The conflict resolution keeps both exact calendar cases, including the boundary-weekend regression. Other changes from main remain intact.

| Period | Internal weekends | Expected pauses |
|---|---|---|
| 2026-09-07 through 2026-10-06 | September 12–13, 19–20, 26–27; October 3–4 | 4 |
| 2026-09-05 through 2026-10-04 | September 12–13, 19–20, 26–27 | 3 |

## Verification

| Check | Result |
|---|---|
| Red regression, `CI=1 E2E_PORT=3310 bash scripts/features/run.sh e2e ANA-11` | 11 passed, 1 failed. Expected at least 4; received 3. |
| Green regression, same command | 12 tests passed. The checklist step first failed because the new YAML text lacked quotation marks. |
| After main merge, same command | Exit 0; 12 passed. Checklist regenerated: 139/157 checked. |
| `bash scripts/features/run.sh check` | After the YAML correction: exit 0, `features.yaml ok (157 Features)`. |
| `bash scripts/features/run.sh render` | Exit 0; regenerated the checklist from the successful test report: 139/157 checked. |
| `npm run lint` | Exit 0. |
| `npx tsc --noEmit` | Exit 0. |
| `git diff --check` | Exit 0. |
| Manual review | Exact calendar expectations, complete missing-data checks, no application changes and no live worker calls. |

## Lessons

Use fixed periods when a chart test asserts calendar-dependent counts. A weekend at a period boundary is not an internal market pause.
