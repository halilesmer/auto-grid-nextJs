---
date: 2026-11-19
author: Claude
type: fix
status: done
features: [FRM-39]
areas: [frontend]
---

# AB=CD C leg: the "N candles ago" badge tooltip opens to the left

## Request
Decision owner: user, 2026-11-19 (1119-A10.1.3). In the C leg block the tooltip of the badge "N candles ago" (PR 614) opened above the badge and covered the entry price. The checklist rows already open their tooltip to the left (PR 615).

## Solution
`FormationTrade.tsx`: the `Tooltip` of the badge gets `side="left"`. No other change.

## Test
`e2e/mocked/formation-trade.spec.ts`, new test "rozetin ipucu sola açılır": with the tooltip open, its box ends at or before the left edge of the badge and does not overlap the entry price cell. Red first (box ended 196 px right of the badge edge), green after the fix. All 51 tests of the file pass.

## Check
Light and dark theme (theme forced through `localStorage`, `html` class checked), tooltip open, C leg section and the right edge of the chart in view: the tooltip stays left of the badge, entry price readable.
