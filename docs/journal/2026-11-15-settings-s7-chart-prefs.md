---
date: 2026-11-15
author: Claude
type: change
status: open
pr: []
features: [USR-16, USR-13, USR-14, ANA-19, ANA-17]
areas: [settings, chart, user-prefs]
---

# Settings S7: personal chart style preferences move to the user

## Request
Store the personal chart style on the worker per user, so the same look shows on a phone and on another computer (plan 1114-A4, step S7, decision 1115-A9.1, design version 13).

## Problem
The chart page kept its style in the browser (`localStorage`: `grid-robot-chart-workspaces-v1`, `grid-robot-analysis-prefs`). Another device started with the defaults. On `/chart` the look was also saved per symbol inside the chart document (ANA-19), so even a shared "global" value did not exist.

## Solution
- Eleven new `user_prefs` keys, listed in `lib/chart-workspace/chartPrefs.ts`: `chart_appearance`, `chart_appearance_templates`, `chart_dock`, `chart_favorites`, `chart_indicator_defaults`, `chart_drawing_defaults`, `chart_drawing_templates`, `chart_fib_templates`, `analysis_layers`, `analysis_trend`, `formation_style`. The worker needed no change (22 of 40 keys, each value below 8 KB).
- The look and its templates are written as the difference to the defaults. A Fibonacci style is written without fields that equal the factory style and with levels as short lists. `change()` refuses a value above 8 KB and shows a toast; the worker is not called.
- The stores no longer apply a user action by themselves. They call `writeChartPref()`; `useUserPrefsStore.change()` applies the value (optimistic, rollback on error) and the bridge `store/chartPrefsBridge.ts` writes it into the store and the local cache. Without a loaded preference set, a change is refused with the toast "Not saved" (USR-13, no queue as in decision A7.1). During a settings-dialog preview the layers and the formation line style change only locally; the dialog writes them once on "Apply".
- S7.1 (Halil, 2026-11-15): the look is one value per user and the same in every symbol. The zoom (visible range) stays per symbol. The old per-symbol looks stay unchanged in the documents and are not read any more (rollback path).
- S7.2: the RSI layer belongs to the chart document and stays on the device.
- One-time migration (`applyChartPrefs`): a key that the worker does not have is written from the local cache once. For the look, the most frequent non-default look of the documents is taken (`pickLegacyAppearance`), else the root value. A worker value always wins; a different old local value is saved once in `grid-robot-chart-prefs-backup-v1`. `grid-robot-chart-prefs-owner` holds the user of the cache: another user gets the defaults and nothing is written. The old cache is not deleted, so a rollback of the code still finds it.
- Stays on the device: `documents` (drawings, indicators added to a symbol, images, visible range, pane order and heights, alarms, overlays), `links`, `toolbar`, `floatingBar`, the old `toolbarLayout`, drafts and previews.
- Settings > Chart: the block "Chart page preferences" (list of six, two buttons, note). "Open chart look" opens the chart settings window (`requestAppearance`), "Open indicators" opens the indicators window.

## Tests changed and why
- ANA-19 tests read the look from `documents[key].appearance`. Under S7.1 the look is one user value, so they now read the root `appearance` of the local cache and the worker key. The test "Bestehendes Chart-Dokument…" now checks the one-time write of the old browser look to the worker. ANA-17 (magnet strength) reads the root value for the same reason. No assertion was loosened.

## Not covered
- A second tab or device sees a change after it loads the preferences again (reload, reconnect). There is no live push. The last writer of a key wins; two devices that change the same template list at the same time can overwrite each other.
- Before the preferences load, chart changes are refused with a toast.
- A color picker that sends many changes quickly sends many requests (they run in order per key).
- Test: `e2e/mocked/settings-chart-prefs.spec.ts` (`@USR-16`).
