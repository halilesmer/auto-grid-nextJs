---
date: 2026-11-10
author: Claude
type: fix
status: done
pr: [497]
features: [ANA-17]
areas: [frontend]
---

# Fib levels outside 0–1 can be selected and deleted

## Request
Halil: a click on a horizontal line of a Fibonacci retracement must select the drawing. The Delete key must remove it. Plan code 1110-A4, step S3 (design note 1110-A4.8).

## Cause
`lightweight-charts-drawing` 0.6.2 tests a click on `fib-retracement` only against the box between the two handles (function `Tl` in `dist/lightweight-charts-drawing.es.js`; x = handles, y = the two handle prices). The same holds for `trend-based-fib-extension` (`Il`). Levels outside the 0–1 band (1.618, 2.618, −0.272 …) are never hit. Selection, hover cursor, drag, double click and Delete all start from the private `DrawingManager.hitTopmost`. So a drawing that cannot be hit cannot be selected, and Delete finds nothing to remove. The library `onKey` handler itself is correct (it skips locked drawings and input fields).

The newest npm version, 0.9.0, has the same box test (checked by reading the code). An upgrade does not help.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/chart-workspace/fibHit.ts` | `extendFibHit(manager)` wraps `hitTopmost`. The original result wins. If it is null, the wrapper checks Fib drawings from top to bottom with the library function `fibLevelAt` (6 px, extended x range included) and returns a body hit. Hidden drawings are skipped (`shown`). |
| `frontend_nextjs/src/components/chart-workspace/ChartWorkspace.tsx` | One call after `new DrawingManager(...)`. |
| `frontend_nextjs/e2e/mocked/chart-fib-hit.spec.ts` | Tests (ANA-17). |

## Why
- Wrapper instead of `patch-package`: the change is small, typed, and covered by a test. It does not touch `node_modules`.
- The wrapper reads private fields (`list`, `coords`, `paneSize`, `shown`, `hitTopmost`). If one is missing after a library upgrade, it does nothing and warns once. A test checks this case.
- No issue was opened upstream (`deepentropy/lightweight-charts-drawing`). An external post needs Halil's approval.

## Verification
- `chart-fib-hit.spec.ts` was red without the wrapper (a click on the 1.618 level did not select; Delete and Backspace removed nothing) and green with it.
- Tests: Delete and Backspace remove the drawing after a click on a level outside 0–1; a click on an empty area clears the selection; a locked drawing stays; missing internals give `false` and one warning.

## Open points
- The seeded case with `extendRight: true` and negative levels is covered by `fibLevelAt` in the library, not by an own test.
