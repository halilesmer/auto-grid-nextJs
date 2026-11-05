---
date: 2026-11-05
author: Claude
type: plan
status: open
pr: []
features: [FRM-03, FRM-18, FRM-30, FRM-41, FRM-42, FRM-43, FRM-44, FRM-45, UI-07, UI-08, UI-13, UI-16]
areas: [frontend, docs]
---

# Formations follow the trend path on the chart

## Request

The owner asked for these changes on the `/chart` page in Formation mode (2026-11-05):

- The formations must use the trend path on the chart and its settings.
- A change of the trend settings must ask before the formations are searched again.
- The alarm card must have a main switch and a trend row.
- A forming formation must show the expected D with a dashed line, and the formation name as a badge.
- The "Formation drawings" button must move next to "Reset view".
- The toolbar buttons must be in groups that the user can move.

## Cause

The code has two zigzags:

| Zigzag | Code | Settings |
|---|---|---|
| Trend path on the chart | `buildTrendPath()` in `lib/formation/trdPath.ts` | The settings of the user (rule, ATR factor, closes, EWO) |
| Base of the formations | `formationTrend()` in `lib/formation/trdFormation.ts` | `formationZug: 'fein'` (default) uses `buildFineTrend()`. `'trend'` calls `buildTrend(tf, bars, wave)` with the default values |

Thus the formation points B, C and "D?" are not on the trend path. The decision of 2026-10-31 ("the sliders change only the line", `2026-10-31-trend-path.md`) caused this. The decision of 2026-11-05 replaces it.

The formations of the rule book depend on the trend path: the harmonic patterns need it, TRD-17 sets the AB move, BAT-01 needs an impulse X to A, CDT-06 and TRD-31 use the trend of the formation timeframe.

## Solution

Approved plan `1105-A5`. Each step has its own session and PR. Each PR has a catalog entry, a tagged test and an update of this entry.

| Step | Item | Content | Model / level | After |
|---|---|---|---|---|
| S0 | all | Design artifact. Approved 2026-11-05 | Opus / medium | — |
| S1 | A5.1 | Formations use `buildTrend(tf, bars, wave, settings)` with the trend settings of the user. `formationZug`, `buildFineTrend()` and the LOSS table go away | Sonnet / medium | S0 |
| S2 | A5.2 | Confirmation strip after a change of the trend settings | Sonnet / medium | S1 |
| S3 | A5.3, A5.4 | Alarm main switch and trend row | Sonnet / low | S0 |
| S4 | A5.5, A5.6 | Expected D and formation badges | Sonnet / medium | S0 |
| S5 | A5.7 | "Formation drawings" button in the toolbar | Sonnet / low | S0 |
| S6 | A5.8 | Movable toolbar groups | Sonnet / high | S5 |

### Parallel order (owner, 2026-11-05)

The owner said: run the steps in parallel when they do not conflict. Thus:

| Wave | Steps | Start |
|---|---|---|
| 1 | S1, S3, S4, S5 | At the same time, after the design approval. They do not wait for this docs PR |
| 2 | S2 | The S1 session starts it after the S1 PR merged |
| 2 | S6 | The S5 session starts it after the S5 PR merged |

S2 and S6 can run at the same time. Max. 5 sessions that write files run at the same time.

Some steps change the same file. Each step changes only its own region of the file:

| File | Step | Region |
|---|---|---|
| `components/formation/FormationChart.tsx` | S4 | `FormationOverlay` only |
| `components/formation/FormationChart.tsx` | S5 | The `modeLayers` line only |
| `components/formation/FormationScanRunner.tsx` | S1 | The `zug` dependency of the search only |
| `components/formation/FormationScanRunner.tsx` | S3 | The alarm symbols only (`bellKey`, `favoritesAlarm`, `alarmSymbols`). With the main switch off, `alarmSymbols` is empty |
| `i18n/messages/formation.ts` | S3 | `formation.alarm.*` keys only |
| `i18n/messages/formation.ts` | S4 | Keys of the expected D and the badges only |

S2 puts the confirmation strip in `TrendSettingsPanel` or `TrendToggle`. S2 does not change `ChartWorkspace.tsx`, because S6 changes it. When a PR that merges later has a conflict, the session updates its branch with `sync_with_base_branch`.

### Design decisions (approved 2026-11-05)

| Code | Decision |
|---|---|
| A5.1 | The formation points X, A, B, C are vertices of the trend path. The option "fine zigzag" and the panel group "Formations" go away. No option remains |
| A5.2 | A change of the trend settings shows a strip: "Formasyonlar yeni ayarlarla yeniden aransın mı?" with [Yeniden ara] and [Geri al]. Until the user confirms, only the line shows the draft. The formations, the page search and the alarm use the applied settings. [Yeniden ara] sets `trend = trendDraft` and starts the page search and the alarm again. [Geri al] sets the draft back to the applied settings. The strip stays on the chart when the panel closes |
| A5.2.1 | The draft is not saved. A page reload removes it |
| A5.3 | The alarm uses the same trend settings. It has no settings of its own. The alarm card shows a read-only row "Trend: Asgari boyut · 2,5 ATR · 1 kapanış" and a [Ayarlar] button that opens the trend panel. The row shows the applied settings, also when a draft exists. The label is the real i18n label "Asgari boyut" |
| A5.4 | A main switch is at the right of the title "Formasyon alarmı". Off: no search and no alert. The selections stay. They show dimmed and the user can still edit them. The status line shows "Kapalı · seçimler korunuyor" (new key). The bell shows `BellOff` without the dot. Old stored data counts as on |
| A5.5 | A forming formation shows a dashed leg from the last point (C) to the expected D. The D price is the target level. The D time is in the future: C plus the duration of AB. A "D?" ring and a price label on the price axis mark it. This agrees with rule Z-ABCD-02 (D projection dashed, level 1). Today the dashed leg stops at the close of the last candle |
| A5.6 | A badge with the formation name is next to the D? ring: "ABCD · oluşuyor" (warning border), "Gartley ✓" (success). Text from `formation.form.*` and `formation.verdict.*`. The name stays "ABCD" |
| A5.6.1 | More than one formation: the badges are in one stack. The selected formation shows in full. The other formations show only a dim D? ring and a dim badge. A click on a badge selects that formation. When two D levels are nearer than 1.5 ATR, one band "D? bölgesi" shows both |
| A5.7 | "Formasyon çizimleri" leaves the Layers menu. It becomes a toggle button with `aria-pressed` next to "Görünümü sıfırla". It shows only in Formation mode. The section "Yalnız Formasyon modunda" of the Layers menu goes away. The value stays in `overlays.formations` |
| A5.8 | Four groups: View (reset view, formation drawings), Indicators (indicators, trend, trend settings, layers, `toolbarActions`), Edit (undo, redo, drawing objects), Window (chart settings, full screen). Each group has a handle. The user drags a group to the top strip, the bottom strip or a free position on the chart |
| A5.8.1 | Default layout "auto": the same as today. At 71rem and wider all groups are in the top strip, below 71rem in the bottom card. When the user moves a group, its position is fixed and stored in the browser |
| A5.8.2 | A free position is stored as a ratio of the chart area. The group stays inside the chart when the size changes. A free group that does not fit goes to the bottom strip. At 375 px the strips wrap. No horizontal scroll (UI-08) |
| A5.8.3 | The handle is a button with a menu: "Üste taşı", "Alta taşı", "Grafiğe bırak". The current place is disabled. The arrow keys move a free group. Thus keyboard and touch do not need drag |
| A5.8.4 | "Araç çubuğunu sıfırla" is in the chart settings dialog and at the bottom of the handle menu. It sets the layout back to "auto" |

## Why

The rule book builds the formations on the trend path. Two zigzags give formation points that the user does not see on the chart. The approved plan removes the second zigzag.

Cost: at 2.5 ATR fewer formations occur. Measurement of 2026-10-31 (fine zigzag to trend path, valid hits on real candles): ABCD 24 to 1, BAT 5 to 0, ENC 8 to 0, LIB 62 to 50, KEI 127 to 102, CDT 40 to 102. The owner sets the number of formations with the ATR factor.

Rejected alternatives:

| Alternative | Reason |
|---|---|
| Apply a changed setting at once, without confirmation | Each slider move starts a new search (FRM-18 duration). The alarm history can get many alerts |
| Own trend settings for the alarm | The alarm then reports formations that the chart does not show |
| Keep the option "fine zigzag" | The formation points are then not on the trend path. This is the defect |

## Verification

- The design artifact is a private claude.ai page. The owner approved it on 2026-11-05. The page computed the zigzag and the formation from generated candles. A `node --check` of its script passed.
- No code changed in S0.

## Open points

- [ ] S1: formations follow the trend path (FRM-41)
- [ ] S2: confirmation strip (FRM-42)
- [x] S3: alarm main switch and trend row (FRM-43). PR 380. The main switch is the stored flag `active`; old stored data counts as on. Off: `alarmSymbols` is empty, the search for favorites continues. The e2e test fails when the alarm is on (checked). Run e2e tests with your own `E2E_PORT`: other worktrees use port 3100 and `reuseExistingServer` then tests their build
- [ ] S4: expected D and badges (FRM-44)
- [ ] S5: "Formation drawings" button (FRM-45)
- [ ] S6: movable toolbar groups (UI-16). The plan named UI-10, but UI-10 is already in use
- [ ] After S1: the owner checks the chart with an ATR factor of 1.5

## Lessons

Do not let a second calculation of the same zigzag decide what the user sees. When a chart shows a line, the formations must use that line and its settings.
