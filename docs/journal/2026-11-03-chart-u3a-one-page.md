---
date: 2026-11-03
author: Claude
type: change
status: open
pr: []
features: [UI-14, UI-13, UI-12, UI-01, FRM-30]
areas: [frontend, docs]
---

# One page "Chart" with the modes Formation, Setup and Free (U3a)

## Request
Step U3a of "One chart in the system" (`2026-11-01-unified-chart-page.md`). The formation page moves to `/chart` and becomes the mode **Formation**, next to **Setup** and **Free** and the switch **Statistics**. Approved design: "One chart, 03.11." (boards Chart-Formation, Chart-Setup, Chart-Frei, Chart-Handy). The gear `analysis-settings` stays; U3b removes it.

## Solution
| File | Change |
|---|---|
| `src/lib/chart/mode.ts` | New. `resolveChartMode`: an explicit `mode` wins; else `zone` or `tab=stats` gives setup; else `symbol` gives free; else formation. `timeframeParam` and `timeframeAllowed`: formation allows D1/H4/H1/M15 (default H4), setup and free allow M1…D1 (default M15). |
| `src/hooks/useUrlUpdate.ts`, `useChartMode.ts` | New. One place for the URL write (the "pending" logic was in two hooks). `setMode` keeps account and symbol, resets a `tf` that the new mode does not allow, clears `form` outside formation and `zone` in free mode. |
| `src/hooks/useAnalysisParams.ts`, `useFormationParams.ts` | Use the shared parts. Each formation write also writes `mode=formation`: a lone `symbol=` would read as free mode. |
| `src/components/formation/FormationView.tsx` | The old `app/formasyon/page.tsx`, moved with `git mv`. The toolbar gets the mode segment. |
| `src/app/chart/page.tsx` | Chooses `FormationView` or the old analysis view by mode. One account select (`FormationAccountSelect`) for all modes. |
| `src/components/chart-page/ChartTopBar.tsx` | `ChartModeSegment` (Formation / Setup / Free) replaces the mode `<select>`. |
| `src/components/chart-page/ChartPage.tsx` | The right 40 px strip is reserved only when the page has a panel (formation). Setup and free use the full width. |
| `next.config.ts` | Redirect `/formasyon` to `/chart?mode=formation`. Next passes the query of the request on (checked in the Next 16 docs and by test), so old alarm links keep symbol, form and `tf`. |
| `src/lib/formation/alarmNotify.ts` | `formationUrl()` makes `/chart?mode=formation&account=…`. Saved notices and the service worker open the old URL and get the redirect. |
| `src/components/layout/AppNav.tsx`, i18n | One menu item "Chart" (`nav.chart`, with `.hint`) replaces "Analysis" and "Formation". The floating navigation below lg now applies to `/chart`. The keys `nav.analysis`, `nav.formation` and `analysis.chart.key.noData` (unused since U2b) are removed. New keys `cw.mode.formation|setup|free` with hints. |
| `docs/features/features.yaml` | New feature UI-14. Route texts of the FRM and ANA entries follow. The text of UI-04 said the "Test" link opens `/chart`. The code opens `/backtest`. Corrected. |

User data stay. The storage keys of the workspace views `analysis` and `formation` (drawings, indicators), `grid-robot-formation-sidebar` and `grid-robot-formation-alarm` did not change.

## Review findings of the owner's check (fixed)
1. **Menus at 812 × 375.** The panel height `max-h-[min(70dvh,calc(100dvh-24rem))]` of the menus "Layers" (`LayersMenu.tsx`) and Trend settings (`TrendToggle.tsx`) became 0 at 375 px height, because 375 − 384 is negative. The height now has a lower limit: `min(70dvh, max(12rem, calc(100dvh-24rem)))`. The test opens both menus in all three modes at 812 × 375: height ≥ 120 px, inside the window.
2. **Tool bar over the top bar.** The tool bar with the button "Layers" is 374 px wide (456 px at 20 px font). The reserve was 18 rem (288 px). It was measured before "Layers" existed. At 1520 px window width the tool bar covered the status button "Koşullar". The reserve is now 24.25 rem (`pr-97`): 374 + 4 px margin + 8 px gap = 386 px ≤ 388 px (at 20 px: 469 px ≤ 485 px). The account and symbol selects of the formation bar are 176 px wide (were 208 and 192 px) so the bar stays one 38 px row at 1440 px (FRM-23). The top bar of the formation mode now wraps like the other two (the mode segment made the single row about 140 px longer, so a single row would need a threshold above 1250 px). The threshold stays 71 rem. The test goes through the container widths from the threshold to 1250 px in all three modes and checks that no element of the top bar lies under the tool bar. Without the fix it failed at 1136 px (formation) and 1224 px (free).

## Changes of existing tests
Only places and names changed, no check was weakened or removed.

| File | Change | Reason |
|---|---|---|
| all specs with `/formasyon?account=` | URL `/chart?mode=formation&account=…`; `nav.analysis` and `nav.formation` become `nav.chart`; URL checks `/formasyon$/` become `/chart$/` | The page moved. `chart-topbar.spec.ts` and `chart-one-page.spec.ts` keep the old URL on purpose (redirect path). |
| `accounts`, `analysis`, `logs-ui`, `tooltips` specs | `selectOption('setup')` on the mode select becomes a click on `chart-mode-setup`; `toHaveValue('setup')` becomes `aria-pressed="true"` | The mode select is now a segment (design). |
| `header-menu.spec.ts` | The list of menu items has one item "Chart" | Two items merged. |

## Open
- U3b: remove the gear `analysis-settings`; its switches go to the legend and the menu "Layers".
- In landscape (812 × 375) the top bar uses about 150 px. Noted, not part of U3a.
