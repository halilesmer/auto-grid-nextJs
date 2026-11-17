---
date: 2026-11-17
author: Claude
type: fix
status: open
pr: []
features: [FRM-48, UI-22]
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
- `formation-ask.spec.ts` (@FRM-48): before the answer there is no note; after "Evet" the badge shows with "H4", there is no status with "EURUSD", and the badge goes away in 12 s and does not come back after the silent rescan; after "Hayır" the note is `off` with "Formasyonlar aranmadı."; a favorite shows the badge; a held M15 request shows `searching` and the note text is never "no formation" (MutationObserver records each text).
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

## Open points
- [ ] Phone layout of 1117-C1.1 and 1117-C1.2 is postponed (Halil, 2026-11-17). The phone keeps the toast and the old note.
- [ ] The badge widens the package after the buttons came (one more move of the package, and one more when it goes after 8 s).
- [ ] At 375 px with `?symbol=EURUSD&tf=H4` and the question not answered by the fixture, the question strip did not come in 30 s (2 runs: one before and one after `DockPhone`). With the setup address (`?zone=`) and no fixture trend the search did not finish in the test time either. The phone guard is therefore in the FRM-23 phone case (fixture data). The change does not touch the inputs of the question phase; the cause is not known (not examined, the phone is postponed).
