---
date: 2026-10-30
author: Claude
type: feature
status: done
pr: []
features: [ANA-20, UI-07]
areas: [frontend, tests, docs]
---

# Oscillator pane controls

## Request
- Add pane actions and indicator menus for RSI, EWO, MACD and ATR.
- Keep settings in the matching local chart document.
- Do not add script execution, background alarm services or worker API changes.

## Solution
| File | Change |
|---|---|
| `chart-workspace/OscillatorControls.tsx` | New. Pane bar (move, collapse, maximize, remove) and the menu of each indicator. |
| `chart-workspace/ChartWorkspace.tsx` | Wire the bar, local alarms, read-only info and formula dialogs, object list with indicators. |
| `chart-workspace/runtime.ts` | Group oscillators by `paneId`, apply collapse and maximize with stretch factors, per-indicator scale side. |
| `useChartWorkspaceStore.ts` | Parse `paneId`, `scaleSide`, `paneCollapsed` and `alarms`. Old documents load unchanged. |
| `indicators.ts` | New fields, `isOscillator`, `indicatorFormula`. |
| `IndicatorDialog.tsx` | Favorites on top, scroll to the indicator that opened the settings. |
| `workspace.ts`, `workspaceHints.ts` | Labels and hints in tr, en and de. |
| `chart-workspace.spec.ts`, `tooltips.spec.ts` | Four `@ANA-20` tests and one `@UI-07` coverage test. |

## Why
| Decision | Reason |
|---|---|
| `scaleSide` default `auto` | Old documents had no field. `auto` keeps the chart axis, so they look the same as before. |
| `paneId` of a legacy indicator is its own `id` | Each old oscillator keeps its own pane. |
| Collapse uses stretch factors | `pane.setHeight()` needs a finished layout. New panes have none, so the first collapse did nothing. |
| Maximize is not saved | Required by the request. State is keyed by chart and timeframe and lives in React state only. |
| Favorites are per indicator kind in the browser-wide store | Matches the existing drawing favorites. The indicator dialog reads them. |
| Alarms only in the analysis and free chart | Backtest and formation charts show history. Their values never cross a level live. |
| Crossing needs two samples of the same chart and timeframe | A timeframe switch changes the whole series. The first version fired on the switch. |
| Alarm fires once | After the crossing the alarm is set to not armed and stays listed as fired. |

## Verification
| Check | Result |
|---|---|
| `npx tsc --noEmit` and `npm run lint` | Clean on the final source. |
| `scripts/features/run.sh check` | 191 features valid. |
| `E2E_PORT=3341 scripts/features/run.sh e2e ANA-20` | 5 passed (four `@ANA-20` tests, the `@UI-07` coverage test). Before the collapse fix: 3 failed. |
| Alarm guard removed temporarily | The alarm test still passed, so it does not prove the guard. The guard stays as a safety measure; the test proves the observable result (no alarm on a timeframe switch, one alarm on a live crossing). |
| `E2E_PORT=3341 scripts/features/run.sh e2e` (full mocked suite) | 1619 passed, 2 failed (`ANA-03` display switches, `ANA-10` custom range). Both hit the 30 s timeout under full load. |
| Both failed tests alone, 3 repeats each | 6 of 6 passed. |
| `E2E_PORT=3341 scripts/features/run.sh e2e ANA` | 105 passed. |
| Screenshots (mock worker, desktop, 375 px, formation page) | Checked. The formation page showed the bar behind the chart overlay, so it moved to the bottom-left. The menu opens upward there. |
| After the last placement change: `scripts/features/run.sh e2e FRM` and `e2e UI` | 992 and 109 passed. |
| Live worker | Not used. No worker code changed. |

## Review (`hooks/RULES.md` §9)
| Area | Result |
|---|---|
| Worker, bot state | Not touched. |
| Enum values | `scaleSide` gets a third value `auto`. Consumers: runtime, store parser, bar. No worker consumer and no mock-worker use. |
| Time | Alarm samples come from the chart values. No clock use. Backtest and formation have no alarms. |
| Context | Document key of the chart holds order, pane, collapse, scale, visibility and alarms. A test checks a second context and a legacy document. |
| Security | No network, no new dependency, no HTML from stored data. Formula text is built from numbers and fixed names and shown as text. |

## Open points
- [ ] Alarms in a background tab are only noticed when the tab becomes visible, because the browser stops chart updates there.

## Lessons
The first Codex version had one test that only read local storage. It did not measure pane heights and could not show a false alarm on a timeframe switch.
A test that passes with its guard removed shows what the guard does not prove. Name that in the entry.
