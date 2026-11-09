---
date: 2026-11-09
author: Claude
type: diagnosis
status: open
pr: []
features: [UI-22]
areas: [frontend]
---

# Live check of the one chart (U4-6)

## Request
Step U4-6 of plan 1107-A21: read-only check of `/chart` on the DEMO account in the built-in browser (v0.7.508), phone check by the project owner, sign UI-22.

## Verification
| Check | Result | Screenshot |
|---|---|---|
| H4 at 1440 px: setup layers, card next to the chart | passed | `images/2026-11-09-u4-6-h4-1440.jpg` |
| M5 and W1: note "formation layer empty", formation buttons gone, alarm bell present | passed | `images/2026-11-09-u4-6-m5-note-1440.jpg` |
| Old links: `/formasyon?…` goes to `/chart?…`; `?mode=free` opens | passed (`?mode=formation` and `?mode=setup` not tried) | none |
| A21.12 data chip: one line (about 220 px), click opens the text, Escape closes it | passed | none |
| 1024 px, open card: next to the chart, no overlap, Chart and Statistics tabs reachable (A21.20) | passed | `images/2026-11-09-u4-6-h4-1024.jpg` |
| 390 px: no horizontal overflow (`scrollWidth` 390) | passed | `images/2026-11-09-u4-6-h4-390.jpg` |
| Phone check (390 px, floating card, chip, nine timeframes, MN, Trades table) | passed, written result of the project owner: "gecti" (relayed by the coordinator session) | none |

Not checked by the agent in the browser: the Trades tab at a 320 px card, MN, 1100 px. The phone check of the project owner covers MN and the Trades table.

## Open points
- [x] 1107-A21.21 (cause found and fixed, see `2026-11-09-chart-collapsed-card.md`): at 1024 px a collapsed card header sat over the chart and covered the price scale (`images/2026-11-09-u4-6-card-collapsed-1024.jpg`). It stayed after a reload. The cause is not known: a defect, or the agent moved the package by mistake (it clicked the toolbar arrow). No fix in this step.
- [ ] Observation: the worker returned candles slowly. H4 took 18 to 40 s. M5 and W1 did not load at all in the test. The cause is not known (VPS load or code).
