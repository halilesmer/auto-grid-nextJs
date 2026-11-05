---
date: 2026-11-05
author: Claude
type: fix
status: done
pr: []
features: [UI-11]
areas: [frontend]
---

# Duplicate React keys rsi and wave in the legend

## Request
On `/chart?mode=formation` the browser console showed "Encountered two children with the same key" for `rsi` and `wave` (45 times, the Next dev issue counter rose).

## Cause
`IndicatorLegend` renders each pane as `<div key={paneId}>` with two siblings: the row (`systemRow`, key = pane id) and `paneControls` (key = pane id). Since UI-11 (PR 386) the system oscillators use the pane model, so both siblings carry `rsi` or `wave`. For user oscillators the rows sit in an array, so no clash. There was no double registration of a pane: `paneIds` has no duplicate. React warns only in development, so the production build of the e2e run never showed it.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/IndicatorLegend.tsx` | `paneControls` is a single child and not part of a list: its `key` is removed. |
| `frontend_nextjs/e2e/mocked/chart-layers.spec.ts` | New test (UI-11, three pages): no `same key` console error, one `rsi` and one `wave` row. |

## Why
Rejected: a unique prefix on both keys. The key was not needed on the single child, and the prefix would hide a real duplicate later.

## Verification
- Against `next dev` (port 3612, mock worker address): before the fix 3 failed (rsi and wave messages), after the fix 3 passed.
- In the production build the test passes before and after. It bites only with a dev server.

## Lessons
- A key on a single child that sits next to a keyed sibling can collide with it. Give keys only to list items.
- Dev-only React warnings need a `next dev` run: `E2E_REUSE=1 E2E_PORT=<port>` with `NEXT_PUBLIC_API_URL=http://mock-worker.test`.
