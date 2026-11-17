---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: [592]
features: [ANA-19, ANA-20]
areas: [tests, chart]
---

# ANA-19 slow test and ANA-20 legend shift: causes measured and fixed

## Request
Step 4, part A of the coordinator "K- Test altyapısı: kalan açık noktalar" (2026-11-17). Two open points of `frontend_nextjs/e2e/mocked/chart-workspace.spec.ts`:

- ANA-20 `:526` ("Indikatormenü …"): the legend row moves while the test clicks, and the click goes to a different button (journal `2026-11-16-flaky-tests-ana27-ui26-ana20-frm30-usr17`, cause partly measured).
- ANA-19 `:386` ("Anzeige-Einstellung speichert erst beim Anwenden …"): 23.5 to 28 s in CI on the first try, the limit is 30 s (journal `2026-11-16-precheck-retry-like-ci`).

Rules of the owner: a test is not made weaker (no longer wait, no `force: true`, no retry, no higher limit). Visible UI changes need an approved design first.

## Cause

All measurements: Mac, mocked e2e, production build in `.next-e2e`, own `next start` with `E2E_REUSE=1`, temporary spec files (`zz-*.spec.ts`, not committed). Repeated runs under the heavy lock (SYS-11). The first lock wait was 3706 s (three other sessions in the queue).

### ANA-19 `:386`: a toast covers Cancel and Apply

| Measurement | Result |
|---|---|
| CI duration of `:386` on `main`, runs 44007385668, 43978865458, 43974390314 | 24.2 s, 24.1 s, 24.6 s. Other tests with 3 page loads in the same file take 11 to 13 s (`:526`). |
| Copy of `:386` with a time stamp after each step, 6 runs with 3 workers and 3 runs with 1 worker (load average 15 to 42) | 22.2 to 24.9 s per run. The click on "İptal" took 7.6 to 8.1 s, the click on "Uygula" 7.9 to 8.5 s. All other steps took less than 1.2 s. |
| Same copy, element at the center of the button right before each click (`document.elementFromPoint`), 2 runs | 4 of 4 clicks: the element was the toast "USOUSD: formasyon taraması bitti …" (formation search finished, 7 s). Playwright waits until the button receives the pointer, so the click waited until the toast closed. |
| Same copy with `formationAsk: 'manual'` (the test fixture does not answer the search question, so no search and no toast), 2 runs | 4 of 4 clicks: the element was the button. The clicks took 0.2 to 0.4 s, the run 10.9 to 11.9 s. |

Root cause (measured): the test opens the setup chart (`zone=…`), which starts the formation search. The toast of the finished search covers the footer buttons of the settings dialog for 7 s, two times in the test (after the first load and after the first reload). This adds approx. 16 s to a test of approx. 8 s of work.

Finding, not fixed (visible UI): the same toast covers "İptal" and "Uygula" of the chart settings dialog for the user too, for 7 s after each search.

### ANA-20 `:526`: the value text of the legend row changes its width

| Measurement (copy of `:526` with a log of `pointerdown`, `pointerup`, `click`, `pointerover`, the text of each legend value and the x positions of the row buttons; `PerformanceObserver('layout-shift')`) | Result |
|---|---|
| `--repeat-each=20`, 6 workers, load average 26 → 16 | 6 of 20 failed. 5 timeouts while the test waited for a menu item: each had one press where `pointerdown` and `pointerup` had different targets; the 14 passed runs had none. 1 other failure (see below). |
| The other failure | In `openOscillatorChart`, after `page.reload()`, `oscillator-controls` was not visible within 7 s. The log of the page after the reload had no press and no text of a legend value. Cause not known: the trace was deleted before it was examined. Not seen in the other 19 runs. |
| Sequence in each of these 5 presses | 1. A menu item or dialog closes; the mouse stays, and the element under it is now the chart canvas (`pointerover CANVAS`). 2. The chart shows its crosshair at the left edge, where RSI(14) or EWO(5/35) has no value yet: the legend shows `RSI (14) —` or `EWO (5/35) —`. 3. Playwright reads the position of the "… işlemleri" button in this state and presses it. 4. 4 to 12 ms later the mouse is off the chart, the crosshair goes away, and the legend shows the latest value again (`29,85`, `-1,77903`). The row gets wider by 26 px (RSI, 4 characters) or 46 px (EWO, 7 characters). 5. `pointerup` hits the button to the left of the trigger ("RSI göstergesini sil", "EWO ayarlarını aç"); the browser sends `click` to the common parent, and the menu does not open. |

Root cause (measured): the legend row puts the buttons after the value text (`IndicatorLegend.tsx`, `rowShell`). The value under the crosshair and the latest value can have different lengths, so the buttons move when the mouse goes from the chart to the legend. The same happens for the user, and also when a live price changes the length of a value (for example `9,98` → `10,02`).

## Solution

ANA-19 (PR 592, test only): the test runs in a block "ohne Formationssuche" with `test.use({ formationAsk: 'manual' })`. The test is about the chart settings dialog and needs no search. The same option is used in `chart-dock-s5.spec.ts` for the same toast.

ANA-20 (second PR): a stable position of the legend buttons is a change of the visible legend. A design with three options was sent to the coordinator for the owner (artifact "Lejant düğmeleri kaymasın"). The owner approved option B on 2026-11-17 ("İkisinde de B"): the value keeps the width of the longest value seen for this indicator, and it does not get smaller. The order of the row (name, parameters, value, buttons) does not change.

| File | Change |
|---|---|
| `frontend_nextjs/src/components/chart-workspace/IndicatorLegend.tsx` | The value of each legend row is in its own `inline-block` span with `width: <n>ch`. `n` is the length of the longest value text shown for this indicator in this legend; it is kept in state and only grows (state update during render, no effect). |
| `frontend_nextjs/e2e/mocked/chart-workspace.spec.ts` | New test "Lejant: imleç grafikten düğmeye geçince satırın düğmeleri yerinde kalır" (ANA-20): crosshair on the first candles (RSI and EWO show "—"), read the x position of both "…" buttons, move the mouse to the RSI button, wait for the latest values, the x positions must be equal. |
| `docs/features/features.yaml` | ANA-20: description and expected result. |

## Why

- ANA-19: the assertions do not change. Only the unrelated toast is gone. Rejected: a split of the test into two tests. The time was not in the work of the test; each half would still wait for the toast. Rejected: close the toast in the test. It would add a step that depends on the toast and its timing.
- ANA-20: a change of the test (for example, move the mouse away from the chart before each click) would hide a defect that the user has too.
- ANA-20, `width` and not `min-width`: with `min-width: 8ch` the new test failed 10 of 10. The RSI button stayed (234.42 px), the EWO button moved by 0.0156 px (1/64 px, one layout unit of Chromium): the text "-1,77903" was 1/64 px wider than 8ch, so the box grew with the text. With `width` the box depends only on the number of characters. The text can be up to 1/64 px wider than the box; no character is cut (measured below).
- ANA-20, the state lives in the component: a value seen in one chart context does not change the width in another one (the legend has a `key` per context).

## Verification

| Check | Result |
|---|---|
| `:386` with the change, `--repeat-each=10`, 3 workers, under the heavy lock (113 s wait), load average 15 | 10 passed in 28.1 s |
| `:386` with the change, `--repeat-each=3`, 1 worker, load average 18 to 28 | 3 passed, 11.9 s and 12.2 s per test (Playwright list reporter) |
| PR 592, CI run 44026467962 | green; `:386` took 7.3 s. Flaky: `chart-toolbar.spec.ts:170` (1440px dark), not caused by the PR (coordinator decision) |
| ANA-20 new test, code of `main` (`47cc88c3`), `--repeat-each=3`, under the heavy lock (227 s wait) | 3 of 3 failed: x of the "…" buttons `[208.0, 221.2]` before, `[234.4, 267.4]` after (26 px and 46 px) |
| ANA-20 new test, fix with `min-width`, `--repeat-each=10` (lock wait 3602 s) | 10 of 10 failed: RSI equal, EWO 267.4219 → 267.4375 (1/64 px) |
| ANA-20 new test, fix with `width`, `--repeat-each=10`, 3 workers, load average 112 | 10 passed |
| ANA-20 `:526` ("Indikatormenü"), fix with `width`, `--repeat-each=20`, 6 workers (before: 6 of 20 failed) | 20 passed |
| `chart-workspace.spec.ts`, `chart-hover.spec.ts`, `chart-indicator-dialog.spec.ts`, `chart-indicator-menu.spec.ts`, `chart-single-rsi.spec.ts`, fix with `width` | 68 passed |
| Width probe (temporary spec, not committed): 7 indicators (SMA, EMA, BB, RSI, EWO, MACD, ATR), mock prices near 97 and near 97 000 (the mock rates multiplied by 1000), viewport 1280 and 375 px, states: latest value, crosshair at the left edge ("—"), crosshair at 3 positions; same probe with the legend of `main` | Text wider than its box: at most 0.0156 px. Latest value: the width of each row and the truncation are the same as on `main` in all 4 setups. At 375 px, EWO, MACD and ATR are truncated with "…" on `main` too (2 to 43 px). New: in the "—" state these rows keep their width, so at 375 px they are truncated in this state too (on `main` the short "—" fitted). Space after "—": RSI 26.4 px (as in the design), 8 characters 46.2 px, 12 characters (SMA near 97 000) 72.6 px |
| `npx tsc --noEmit`, `npx eslint` (changed files), `update_checklist.py --check` | clean; `features.yaml ok (284 Features)` |

## Open points
- [x] ANA-20: design B approved by the owner (2026-11-17), failing test and fix in the second PR.
- [ ] ANA-20: the owner examines the legend on a phone (375 px): rows that are truncated with the latest value now stay truncated in the "—" state too.
- [ ] ANA-20 `:526`: 1 of 20 runs failed because the legend did not come within 7 s after the reload in `openOscillatorChart`. Cause not known; keep the trace of the next failure.
- [ ] The toast "formasyon taraması bitti" covers the footer buttons of the chart settings dialog for 7 s (visible UI, design first).
