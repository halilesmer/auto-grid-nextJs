---
date: 2026-11-08
author: Claude
type: feature
status: done
pr: []
features: [UI-22, UI-17, ANA-26]
areas: [frontend, tests, docs]
---

# Chart U4-5: remove the old shells

## Request
Step U4-5 of plan 1107-A21 (`2026-11-08-one-chart-no-modes-plan.md`). The one chart (`OneChart`) is live since U4-4a and U4-4b. The old page shells and every trace of `mode` leave the code. Old `?mode=` links and the redirect `/formasyon` keep working (UI-22 tests stay green).

## Solution
| Part | Change |
|---|---|
| Deleted files | `FormationView.tsx`, `ZoneChartPanel.tsx`, `FormationSidebarTabs.tsx`, `ChartPanel.tsx`, `FormationToolbar.tsx`, `useChartMode.ts`, `useFormationParams.ts`, `lib/chart/mode.ts`. No user was left for any of them (`rg` and `tsc`). `AnalysisView` and `ChartModeSegment` as shells were already gone, except `ChartModeSegment` inside `ChartTopBar.tsx`, which is removed now. |
| `ChartTopBar.tsx` | No `mode` slot, no `ChartModeSegment`. The legend row (`extra`, button "Legend") is also removed: no page passed `extra` since U4-4a. |
| `SetupCardTabs.tsx` | The old shell `SetupCardTabs` is removed. `SetupOverview`, `SetupTrades`, `SetupSwitches`, `NoSetupNote` stay (used by `OneChart`). |
| `useAnalysisParams.ts` | Only `/backtest` uses it. It keeps `accountId`, `zoneId`, `range`, `setAccount`, `adoptAccount`, `setZone`, `setRange`. `tab`, `symbol`, `mode`, `timeframe` and their setters are removed. `setAccount` no longer adds `mode=setup` to the URL. |
| `lib/chart-workspace/dock.ts` | The package `mode` leaves `DOCK_PACKAGES`, the default layout and `SHRINK_ORDER`. A stored `mode` is dropped by `parseDockLayout` (it keeps only known ids). |
| i18n | 66 entries (22 keys, 3 languages) removed: `cw.mode`, `cw.mode.*` and their hints, `analysis.chart.key.toggle` (+ hint), `analysis.chart.key.hint/pause/rsi`, `analysis.chart.empty.*`, `formation.fav.toggle` (+ hint), `formation.sidebar.tabs`, `formation.tab.conditions.hint`, `formation.tab.favorites.hint`, `formation.conditions.hint`, `formation.empty.chart`, `cw.tbGroup.mode`. Each key had no user left (script over all keys, checked with the code at the start of the step). |
| Catalog | The deleted files leave 43 places in the `code:` lists of `features.yaml`. `FEATURES.md` is generated again (no text change). |
| Catalog texts | UI-17 and ANA-26 descriptions: eight packages, no modes. |
| Docs | `CLAUDE.md` and `docs/proje_dosya_krokisi.md` describe the one chart. Comments that named the deleted files are fixed. |

## Decisions in this step
- `FloatingCard` keeps its prop `collapseSignal` and `ChartPage` keeps `panel` / `panelShown`. U4-5b (decision 1107-A21.18) changes the card layout and decides about them.
- `legacyKeys.ts` keeps the `mode` argument of `workspaceKey`: it builds the three old storage keys that the first open of the chart reads (1107-A21.6).
- `cw.tbGroup.mode` is removed too (3 more entries): the dock builds `cw.tbGroup.<id>` only from existing package ids.

## Test changes
No assertion was loosened.
| Test | Change | Reason |
|---|---|---|
| `chart-dock-lib.spec.ts` "Varsayılan yerleşim", "v1 kaydından geçiş" | `mode` leaves the expected row 1. | The package is gone. |
| `chart-dock-lib.spec.ts` "Bozuk kayıt onarılır" | The stored `mode` in rows, `free` and `pos` is still in the input. New checks: the result holds no `mode`, and `DOCK_PACKAGES` has no `mode`. | New lib test for "a stored `mode` is dropped". |
| `chart-dock-lib.spec.ts` "Satıra taşıma" | `mode` replaced by `actions` as the moved package. | Same move logic, a package that exists. |
| `analysis-calendar-lib.spec.ts` "Adresse: ?tf=W1\|MN gilt nur im freien Modus" | Deleted. | It tested `timeframeParam` / `timeframeAllowed` of the removed `lib/chart/mode.ts`. The per-mode timeframe rule (setup: no W1/MN, formation: only 4 timeframes) is gone by decision 1107-A21.1. |
| `chart-dock-s4.spec.ts` (a), `chart-dock-s5.spec.ts` (a), (c), `DEFAULT_LAYOUT` | `mode` leaves the expected stored `row1`; the comments "until U4-5" go. | The package is gone. |
| `formation-page.spec.ts` (3 places) | The selector `formation-topbar` (test id of the deleted `FormationToolbar`) becomes `chart-topbar`. | The loops ran over zero elements before; now they check the real top bar. |
| `chart-url-lib.spec.ts` new "W1 and MN are valid for every old mode link; only D1, H4, H1, M15 have formations" | Added (`@UI-22`). | The behavior that lives on: `parseChartUrl` accepts all nine timeframes for old links and falls back to H4; `hasFormations`. |

## Checks
- `rg` for the removed names (code, tests): no user. Only journal files and old catalog descriptions (`beschreibung`) name them.
- `tsc --noEmit`, `eslint`: no new problem.
- `scripts/features/precheck.sh`: see the result below.

## Result
`scripts/features/precheck.sh`: catalog, worker tests, lint and tsc pass. The e2e run had 3250 passed and 5 failed (3255 ran). The 5 tests have no link to this change:
- `heavy-lock-lib.spec.ts` (4 tests, `@SYS-11`): they run the lock script, and inside `precheck.sh` the real lock is held by `precheck.sh` itself. The tests see a holder and fail.
- `csv-import.spec.ts` `@BKT-05`: timeout under load.
All 5 were run again alone under the lock: all pass (39 passed). Follow-up: the 4 lock tests should use their own lock directory when the lock is already held.
