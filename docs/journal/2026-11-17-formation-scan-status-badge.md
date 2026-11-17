---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: [603]
features: [FRM-48, UI-22, ANA-27]
areas: [chart, frontend]
---

# Formations row: "searching" note and result badge instead of the toast (1117-C1.1 A, 1117-C1.2 A)

## Request
Step 5 of the coordinator 1117-A2, after the findings in `2026-11-17-chart-older-page-dock-scan-findings` (items 2 and 5). Halil approved option A for both designs (https://claude.ai/artifact/Unzu4nh5NDQtD7YPnvQrS7): "Üçü de öneri".

- 1117-C1.1 A: while the search runs, the formations row shows "Formasyonlar aranıyor…", then the result. The note "Bu zaman diliminde formasyon yok." shows only after a finished search. When the search did not run (answer "Hayır"), the row does not say "no formation".
- 1117-C1.2 A: the success toast goes away. The result shows as a badge in the formations row for 8 s. The error toast stays.
- Not in scope: the slide-in of the dock packages when the page opens.
- Later decision (Halil, 2026-11-17, "telefonlar icin UI tarafini simdi yapmayalim. ileride yapariz"): the phone layout stays as it is. The 375 px measurement is cancelled.

## Root cause (from the findings journal)
- The note: `OneChart` passed `emptyNote` when `scan.loading` was false. `loading` is false before the scan requests exist (the answer is there, but the candles or the clock are not). So the row said "no formation" before any search.
- The toast: it is fixed at the bottom right (on the phone along the bottom edge), z-index 70, 8 s. It covered the full-screen button and "İptal"/"Uygula" of the chart settings dialog.

## Change
- `FormationForms`: `emptyNote` is `{ text, state }`. `state` is `searching` (spinner, `motion-safe:animate-spin`), `none` or `off`; the span has `data-state` and `role="status"`.
- `OneChart`: `emptyNoteState()` sets the state. Error: no note (the alert shows). Finished search and not loading: `none`. Loading: `searching`. Answer given, requests not started yet: `searching`; but when the scan has gaps (a time before the first M15 candle, nothing to search), `none` as before. Answer "Hayır": `off`, text "Formasyonlar aranmadı." Question not answered: no note.
- `useFormationAskStatus`: `onShow` is replaced by `onDone(result)`. The hook does not show the success toast. The error toast is unchanged.
- `OneChart` keeps the result for 8 s (`FOUND_MS`) and shows the badge `formation-found` (tone success, hint `chart.formation.found.hint`) first in the formations row: "{count} aday · {tf}: {tfCount}".
- Phone: `DockPhone` reads the phone mode of the dock (`useDock().phone`, header below 30 rem, measured before the first paint) and sends it up to `OneChart` in a layout effect. `OneChart` is the parent of `DockProvider` (it is in `ChartPage`), so `useDock()` in `OneChart` itself returns null. On the phone: the old toast with "Göster" (`announceToast`), the old note rule (`none` when not loading), no badge.
- i18n (tr/en/de): `chart.formation.searching`, `chart.formation.notSearched`, `chart.formation.found`, hint `chart.formation.found.hint`. The toast keys `formation.ask.done`, `formation.ask.doneCount`, `formation.ask.show` stay for the phone.

## Tests
- `formation-ask.spec.ts` (@FRM-48): before the answer there is no note; after "Evet" the badge shows with "H4", there is no status with "EURUSD", and the badge goes away in 12 s and does not come back after the silent rescan; after "Hayır" the note is `off` with "Formasyonlar aranmadı."; a favorite shows the badge; a held M15 request shows `searching` and the note text is never "no formation" (MutationObserver records each text); at 375 px (phone) the old toast with "Göster" comes and there is no badge.
- `formation-page.spec.ts` (@FRM-23): below 480 px (phone layout) the test expects no badge and closes the toast as before; on the wider layouts there is no toast to close.

Red run on the old code (same tests): `4 failed, 8 passed (34.5s)`. The four failures are the new expectations (note before the answer, `off`, badge, `searching`).

## Measurement (1440 × 900, `form=GAR`, the fixture answers "Evet" by itself; per-frame sampler of the formations package)

| | runs | "no formation" visible | "searching" visible | widths of the package (px) |
|---|---|---|---|---|
| before | 4 | 4 of 4, 458 to 1370 ms | – | 230 → 29 → 392 |
| after | 6 | 0 of 6 | 6 of 6, 2353 to 6183 ms | 29 → 183 → 392 → 486 |

- The note "no formation" does not show any more. The package now shows "Formasyonlar aranıyor…" (183 px) until the buttons come.
- New observation: the badge comes 154 to 389 ms after the buttons (it is set in the effect that announces the first search). It makes the package 94 px wider (392 → 486), and the dock moves the package to the left again. After 8 s the badge goes and the package is 392 px again. This is the approved design A; the extra move is reported to the coordinator.
- 375 px: not measured (cancelled by Halil's decision above).

## ANA-27 heavy test: one older page is requested two times

Report from the coordinator: in PR 602 (only tests and journals changed, code equal to `main` e209e752) the test `chart-older-heavy.spec.ts:29` failed in 3 of 4 tries. Only the last page was slow: 8695, 8252 and 8294 ms (limit 8000 ms); the other pages and the passing try took 1.2 to 2.2 s. The last three `main` runs: 1335, 1737 and 2048 ms.

Evidence: the traces of run 44118189455, attempt 1 (artifact `playwright-report-1`, downloaded with Halil's approval, read from the JSON in `trace.zip`, then deleted). The M1 requests of the chart (UTC):

| try | request | from → to | duration |
|---|---|---|---|
| first | 15:58:59.031 | page 1 | 96 ms |
| first | 15:59:05.271 | page 2 (1758912000 → 1760112000) | 104 ms |
| first | 15:59:05.455 | page 2 again, same window | 127 ms |
| first | 15:59:12.325 | page 3 (1758153600 → 1758912000) | 72 ms |
| retry | 15:59:47.853 and 48.057 | page 2, two times | 129 / 202 ms |
| retry | 15:59:54.435 and 54.640 | page 3, two times | 108 / 96 ms |

There were no other M1 requests (the range is in the past, so the 60 s tail refresh does not run; the formation search asks D1/H4/H1/M15; a page is one request). The failed retry delay (15 s) is not in the timeline.

Root cause, two parts:
1. Product (`useMarketRates`): `busy` becomes false when the page answer is there, before React commits the new candles. The test drags every 50 ms; the chart calls `loadOlder` again, `latest` still has the old left edge, and the same page goes out again 180 to 200 ms later. The copy writes the same bars again (`mergeHead` keeps the old bars from `plan.to` and puts the page before them), so nothing shows, but it is a second request per move. From the code, not seen in the traces: if the copy answered after the next page was merged, it would remove that page again (it keeps only bars from `plan.to`) and set the left edge back.
2. Test measurement: the test takes "the first M1 answer after the last draw" as the answer of the next page. When the answer of the copy comes after the draw of page 2, it counts as the answer of page 3: 8.7 s instead of about 1.9 s (page 3: request 12.325, answer 12.397). When the copy answers before the draw, nothing shows. This is why `main` passed: same defect, other timing.

Fix: `useMarketRates` remembers the left edge for which the older page is loaded but not committed (`pageDoneFor`) and does not request it again. The heavy test now also expects that no window (from, to) is requested two times; it fails on the duplicate before the timing check. The limit of 8000 ms is unchanged.

Verification (local, `--workers=1`): without the fix the new check was never red: 0 of 2 at normal speed, 0 of 3 with the CPU slowed down 4 times (CDP `Emulation.setCPUThrottlingRate`). With the fix: 2 of 2 and 3 of 3 green; the ANA-27 tests in `chart-workspace.spec.ts` 10 of 10 green. The only evidence of the copy is the two CI traces. The fix rests on reading the code: in one effect, the same window can go out two times only between the answer and the commit, while `latest` still has the old left edge, and the guard closes exactly this gap. Confidence: medium. If CI shows a copy again, this cause is wrong.

Deterministic red test (requested by the coordinator, `hooks/RULES.md` §8): the decision of the guard is now the pure function `mayRequestOlder()` in `candles.ts`, which `useMarketRates` calls. `chart-older-gate-lib.spec.ts` (@ANA-27) plays the steps of the hook without a browser and without timing: page planned, answer with candles (busy free, `pageDoneFor` set), the state still has the old left edge, then the commit. Without the condition `loadedFrom !== pageDoneFor`: `1 failed, 1 passed` (the gap test: Expected false, Received true). With it: the 2 lib tests, the 2 heavy tests and the 5 ANA-27 tests of `chart-workspace.spec.ts` pass (`9 passed`).

## FRM-30 history test in CI of PR 603: click on the alarm button before the account chart

`formation-page.spec.ts:1880` ("Verlauf löschen …") failed in CI run 44179888722 (shard 3) in both tries: after the click on `formation-alarm` the tab "Geçmiş" did not come in 30 s. In the last 20 CI runs it failed only there. Local: 168 of 168 (load about 22), 126 of 126 with the CPU slowed down 4 times, 4 of 4 with the clock at the CI time (`E2E_FAKE_NOW=2026-11-17T21:33:21Z`).

Evidence: the trace of the first try (artifact `playwright-report-3`, 15,835,730 bytes, downloaded with Halil's approval, deleted after the analysis). The click went to (373, 75) about 180 ms after the page load. The screencast frame at that time shows the page without an account ("-- Bir hesap seçin --"). The panel that opened is the one of `NoAccountChart` (`app/chart/page.tsx`): "Duruyor · hesap seçilmedi", with a note instead of the tabs. When the accounts came, `OneChart` replaced `NoAccountChart`; the alarm button is a new component there, so the open panel was gone (frame at +600 ms). The test then waited for a tab that never came.

Root cause: a race in the test helper `openHistory`, which clicks right after `goto`. It is not caused by the change of this PR (the chart page without an account and its swap are on `main` unchanged); why CI was slow at this point in this run is not known.

Fix: `openHistory` first waits for `timeframe-H4` (only the account chart has the timeframe buttons), then clicks.

Deterministic check (local, `/api/accounts` answered 3 s late with `page.route`): a click right after `goto` opens the panel of the page without an account (`aria-expanded` true, the note "hesap seçilmedi", 0 tabs); after the swap to the account chart the panel is closed (`aria-expanded` false, 0 tabs). Without the delay the panel stays open with 2 tabs. Two arms with the delay set in the test body: old helper (click right after `goto`) 3 of 3 red, new helper 3 of 3 green; the real FRM-30 block with the new helper: 42 of 42. (A first try set the delay in `beforeEach`; the route of the mock worker, installed later, took precedence, so no delay applied and both arms passed.)

Does this PR make the time before the account chart longer? Measured from the load event to `timeframe-H4` (`--workers=1`, 3 runs each): this branch 110, 110, 120 ms; `main` (a84aa39a) 108, 111, 111 ms; first alarm button at 211 to 289 ms against 208 to 218 ms. No change that a user would see. Why the race showed only in this CI run (both tries) is not known.

## Open points
- [ ] Phone layout of 1117-C1.1 and 1117-C1.2 is postponed (Halil, 2026-11-17). The phone keeps the toast and the old note.
- [ ] ANA-27 copy request: confirm in CI that no window goes out two times (the local runs could not show it).
- [ ] The badge widens the package after the buttons came (one more move of the package, and one more when it goes after 8 s).
- Not a defect (corrected): at 375 px the question strip did not come in two runs of a first phone test. Cause: that test did not request the `worker` fixture, so the mock worker was not installed and the page got no data (a probe without `worker` showed no chart at 1440 px either, 4 of 4). The phone test now requests `worker`.
