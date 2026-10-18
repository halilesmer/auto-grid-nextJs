---
date: 2026-10-18
author: Claude
type: feature
status: done
pr: []
features: [ANA-15]
areas: [frontend]
---

# Chart toolbar on the chart, full screen

## Request
Move the broker clock badge, the license info (i) and the display settings (gear) from the page header to the top right of the chart. Add a button that shows the chart in full screen with one click.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart/ZoneChartPanel.tsx` | New `ChartFrame`: wraps the chart (also the empty and loading areas) and shows badge, (i), gear and full-screen button at the top right. Full screen uses the browser Fullscreen API on the frame. |
| `frontend_nextjs/src/components/analysis/chart/ChartCore.tsx` | Chart height becomes `100dvh` when an ancestor is in full screen (`[:fullscreen_&]:h-dvh`). |
| `frontend_nextjs/src/app/chart/page.tsx` | Header controls removed. |
| `frontend_nextjs/src/i18n/messages/analysis.ts`, `hints.ts` | Labels and hints tr/en/de. |

## Why
The frame wraps all chart states, so the badge stays visible when the range has no candles (test ANA-10 needs it). `DropdownMenu` renders inline (no portal), so the gear panel stays visible inside the full-screen element. lightweight-charts uses `autoSize`, so it resizes by itself.

## Verification
- `npx tsc --noEmit` and `npx eslint src`: no errors.
- `scripts/features/run.sh e2e ANA`: 78 passed (includes the new ANA-15 test and the hint coverage test UI-07).
- Visual check in the browser: not verified, the browser pane had no worker connection.

## Open points
- [ ] Manual check ANA-15 on the real chart (full screen, gear in full screen, Esc).
