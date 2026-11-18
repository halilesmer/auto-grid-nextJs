---
date: 2026-11-18
author: Claude
type: fix
status: done
pr: []
features: [ANA-25, FRM-20]
areas: [frontend, chart, tests]
---

# A drawing tool wins over the line of a formation

## Request
Halil, 2026-11-18, 1118-A6.1: "Evet, düzelt". With a drawing tool active (for example Fibonacci or trend line) on `/chart`, a press on a formation line did not reach the tool. The documented priority (ANA-25) is: active tool > drawing below > SVG line of the formation > indicator line > trend line.

## Cause
`FormationLayer.tsx` draws a transparent `line-hit` (14 px, `pointer-events: stroke`) over each formation line. It took each press, also while a tool was active, so the tool did not get its point. The defect is older than PR 616. Since PR 616 the chart opens on the latest candles at the default bar spacing, so the formation spreads over the view and a line lies under the pointer more often.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/formation/FormationLayer.tsx` | `FormationLayer` is inside `DrawingPriorityContext` (provider in `ChartWorkspace`). It reads `useDrawingPriority().toolActive` into state and gives `line-hit` `pointer-events: none` while a tool is active. Without a tool the value stays `stroke`: the line keeps the press (UI-26 decision, journal `2026-11-17-ui26-drag-on-formation-line`). |
| `frontend_nextjs/e2e/mocked/chart-tool-over-formation-line.spec.ts` | New, tags `@ANA-25` and `@FRM-20`, `fakeNow` fixed. |
| `docs/features/features.yaml` | ANA-25 (description, `pruefung`, `erwartet`, code) and FRM-20 (`pruefung`). |

## Why this way
`pointer-events` is evaluated by the browser at press time, but the manager (`DrawingManager.tool()`) does not publish a change of the tool. So reading the tool only at the press is too late, and a change of the tool does not render by itself. The layer listens on `window` (bubble phase) for `pointermove`, `pointerdown`, `pointerup`, `click` and `keyup` and sets state only when the value changes. A tool is chosen by a click (toolbar) or a key, and the pointer moves to the chart before the press, so the state is current at the press. The other way (an event from the manager) would change the drawing code for a change of a few lines; it was not chosen. Not covered: a touch press with no earlier pointer move after a tool change by a key (phone UI is out of scope, 2026-11-17).

## Verification
- Red first: both new tests failed with the old code (`the formation line must not take the press while a tool is active`, `elementFromPoint` returned `line-hit`).
- Green with the change: `scripts/features/run.sh e2e ANA-25`: 27 passed (the 25 earlier tests and the 2 new ones, run on the same build).
- The tests find the pixel at run time: the point on a `line-hit` whose top element at that pixel is the line (`elementFromPoint`), inside the price pane. The tool test draws a Fibonacci from that pixel, then draws it again with the formation drawings off and checks that both have the same points.
- `hideFormationDrawings` (PR 616) stays in the drawing tests: those tests check the tools, not the formation.

## Lessons
- A first draft of the test put the second point in the RSI pane (`y` + 110): no drawing was stored, and the screenshot showed the formation's own Fibonacci levels, not the new one. A screenshot at the failure showed it at once.
