---
date: 2026-11-08
author: Claude
type: plan
status: open
pr: []
features: [ZON-20, ZON-13, ZON-22, LOG-07, UI-07, UI-08]
areas: [frontend, tests, docs]
---

# Plan 1108-A5: compact symbol card (design V4)

The project owner selected design V4 on 2026-11-08, approved the desktop and phone boards, and approved this plan with all decisions below on the same day. The steps are K1 to K4. Each step runs in its own session and its own PR.

## Request
On the dashboard, one symbol card with one setup used about 700 px of height, and half of the card was empty. The card must be smaller: smaller and narrower inputs, less vertical space, and the strip "Sembol logları" must go into the ⋯ menu.

Approved design: https://claude.ai/artifact/HHS1TsuKssCDrwS2oDQQFW ("Kompakt sembol kartı"), boards "V4 · Üç sütun + özet satırı (seçilen)", "V4 mobil 375 px · düzenleme" and "V4 mobil 375 px · özet + ⋯ menüsü". The owner must give access. The boards V1, V2, V3, V5 and "Sembol logları ⋯ menüsünde" are older options and stay unchanged.

## Current state (2026-11-08)

| Topic | Fact |
|---|---|
| Card | `ZoneSettingsPanel` puts each `ZoneCard` into a `SymbolCard`. `SymbolLogs` is a strip below the setups of a symbol. |
| Fields | `ZoneFieldsEditor` has two columns from `lg`: entry left, spread and exit right. The backtest modal `SetupEditor` (max 896 px) uses the same editor. |
| Switches | "Zarara göre aralık ($)" (`step_by_loss`) and "İlk pozisyonu hemen aç" (`instant_entry`) are in `ZoneGridFields`. The fractal mode does not have them. `step_by_loss` changes the unit of `LOSS_DISTANCE_FIELDS` (grid step, pullback, TP, SL). |
| Save | `ZoneHeader` has "Kaydet" per setup (`saveZone`). `useZoneDirtyTracking` keeps the original zones and gives `modified(zone)`. The bar `SaveSettingsBar` saves or discards all setups. |
| Inputs | `.input-s` is 36 px high. Number inputs show the browser spin buttons. |
| e2e | 12 spec files type into fields on the dashboard (`zones`, `accounts`, `settings`, `spread-guard`, `tooltips`, `mobile-layout`, `symbol-cards`, `symbol-setups`, `setup-layout`, `logs-ui`, `fractal-distance-layout`, `legacy-setup-orders`). Some of these fields are account or settings fields. A rough count gives up to 80 tests with setup fields; K3 counts them first. |

## Decisions

| Code | Decision |
|---|---|
| 1108-A5.1 | Design V4: three boxes side by side, "Giriş", "Kırılım ve Pullback" with "Spread koruması", "Bölgeden çıkış". Column ratio 1.2 : 1 : 1. |
| 1108-A5.2 | "Sembol logları" is an item of the ⋯ menu of each setup. All items of one symbol open the same panel. The panel opens over the form, below the setup header, with refresh and close. It polls only while it is open. |
| 1108-A5.3 | Number inputs of a setup have no spin buttons. The arrow keys still work. |
| 1108-A6.1 | "Kaydet" is enabled only when the setup has changes. "Vazgeç" reverts the setup and closes the form. |
| 1108-A6.2 | Below 640 px, "Test" is an item of the ⋯ menu. From 640 px it stays in the header. |
| 1108-A6.3 | The page opens with all saved setups in summary state. A new setup opens in edit state. A setup with unsaved changes always stays in edit state. |
| 1108-A6.4 | The switch `step_by_loss` has the short label "Zarara göre" (new key in tr, en, de). The full name stays in the hint and the aria label. |
| Comments | "İlk pozisyonu hemen aç" is below the row Temel, above "BUY (Alış) Grid". "Zarara göre" is a field column directly before "Grid Adımı" (label above, switch at input height). The three boxes, the setup card and the symbol card have a shadow; the boxes have the strongest one. Exit switch on its own row, the four exit selects below it. |
| 1108-A7.1 | The backtest modal keeps its current layout. Only the order of the shared field components changes there too. |
| 1108-A7.2 | "Vazgeç" on a setup that was never saved removes it, the same as the discard of the save bar. |
| 1108-A7.3 | Three columns from `lg` (1024 px). Below `lg` the boxes stack, as on the phone boards. |
| 1108-A7.4 | Shadows come from new theme tokens in `globals.css` (`:root` and `.dark`), not from colors in components. |
| 1108-A7.5 | Inputs are 28 px high from `sm`, 32 px below `sm` (touch). |

## Steps

The steps change the same files (`ZoneHeader.tsx`, `ZoneCard.tsx`, the i18n files). They run one after another.

| Step | Content | Model | Level |
|---|---|---|---|
| K1 | Header and logs: compact symbol header, setup header on the phone, logs in the ⋯ menu, "Test" in the menu below 640 px, card shadows. | Sonnet | medium |
| K2 | Fields: three columns, new switch places, 28/32 px inputs, no spin buttons, box shadows. | Sonnet | medium |
| K3 | Summary state: summary row, "Güncelle", "Vazgeç", "Kaydet", footer on the phone, test helper for the tests that edit setups. | Sonnet | high |
| K4 | Check on the DEMO account (read-only), phone check by the owner, signatures. | Sonnet | low |

K3 has the level high: it changes up to 80 tests in 12 spec files and adds a new state to every setup.

### K1 Header and logs
| File | Change |
|---|---|
| `components/zone/SymbolCard.tsx` | Label "Sembol (0,000)" next to the input on one row. Card shadow. No `SymbolLogs` strip. Provides the open state of the log panel to its setups (context). |
| `components/zone/SymbolLogs.tsx` | Becomes the panel: header with symbol, refresh, close; Escape and a click outside close it. Same polling. |
| `components/zone/ZoneHeader.tsx` | Menu items "Sembol logları" and, below 640 px, "Test". On the phone: row 1 name, side, range, ⋯; row 2 the buttons. |
| `components/zone/ZoneCard.tsx` | Card shadow. |
| `app/globals.css` | Tokens `--shadow-card` and `--shadow-float` (light and dark). |
| i18n `zone.ts`, `hints.ts` (tr, en, de) | Menu items, panel close, each with `.hint`. |

- Tests: `logs-ui.spec.ts` (LOG-07) opens the logs from the menu; the assertions stay. New: panel closes with Escape; Test in the menu at 375 px; no horizontal scroll at 375 px (UI-08).
- Catalog: LOG-07, ZON-20 and UI-08 texts.
- Done when: `precheck.sh` passes, screenshots at 1440 px and 375 px are in the step entry, the PR is in auto-merge.

### K2 Fields
| File | Change |
|---|---|
| `components/zone/ZoneFieldsEditor.tsx` | Prop `layout`: `columns` (dashboard, three boxes from `lg`) and the current layout (default, backtest modal). Test ids `zone-entry-column`, `zone-guard-column`, `zone-exit-column`. |
| `components/zone/ZoneBasicFields.tsx`, `ZoneGridFields.tsx` | "İlk pozisyonu hemen aç" below Temel (grid mode only). "Zarara göre" as a field column before "Grid Adımı". |
| `ZoneBreakoutFields.tsx`, `ZoneSpreadFields.tsx`, `ZoneExitFields.tsx` | Box styles, exit switch on its own row. |
| `app/globals.css` | `.input-s` 28 px from `sm`, 32 px below. A class without spin buttons for setup number inputs. |
| `ZoneCard.tsx` | Passes `layout="columns"`. |
| i18n `zone.ts`, `hints.ts` | `zone.stepByLoss.short`. |

- Test changes (approved with this plan; only places change, no assertion becomes weaker): `setup-layout.spec.ts` (ZON-20) for the new switch places and the three columns; the ZON-13 tests in `zones.spec.ts` for the place of "Zarara göre".
- New tests: column order at 1440 px; stacked boxes at 375 px with no horizontal scroll, also with BOTH split and fractal mode (UI-08); the backtest modal keeps its layout.
- Catalog: ZON-20, ZON-13, UI-08.
- Done when: `precheck.sh` passes, screenshots at 1440, 1024 and 375 px, the PR is in auto-merge.

### K3 Summary state
| File | Change |
|---|---|
| `lib/setupSummary.ts` (new) | Pure function: zone and symbol config give the list of summary items (key, value, off). Grid and fractal, BUY, SELL, BOTH (sync and split), unit with `step_by_loss`, spread modes, exit. Values through `useFormat`. |
| `components/zone/SetupSummary.tsx` (new) | The items as chips, order as the three boxes. |
| `components/ZoneSettingsPanel.tsx`, hook `useSetupEditState` (new) | Edit state per setup, rules 1108-A6.1, A6.3, A7.2. A successful save closes the form. The save bar "Kaydet" and "İptal" close all forms. |
| `ZoneHeader.tsx` | Summary: "Güncelle". Edit: "Vazgeç" and "Kaydet". On the phone "Vazgeç" and "Kaydet" are a footer below the form. |
| `hooks/useZoneDirtyTracking.ts` | Revert of one setup to its original. |
| i18n `zone.ts`, `hints.ts` | `zone.header.edit`, `zone.header.cancel`, summary keys, each with `.hint`. |
| `e2e/fixtures` | Helper `openSetup(card)`. |

- Test changes: first count the tests that type into setup fields. Each of them calls `openSetup` first. The tooltip test (UI-07) opens each form, so it still sees every field.
- New catalog entry ZON-22 "Setup summary and edit state". New tests: lib tests for `setupSummary` (`@ZON-22`, red first); summary after load; edit after "Setup Ekle"; "Kaydet" disabled without changes; "Vazgeç" reverts; save closes; a changed setup stays open; save bar closes all; phone footer at 375 px.
- Done when: `precheck.sh` passes (it fails when Playwright ran zero tests), the reviewer has no finding, the PR is in auto-merge.

### K4 Check
DEMO account, read-only (`hooks/RULES.md` §3): summary and edit, logs panel, phone at 390 px. The owner checks on the phone. Sign ZON-22 and the changed entries. Set this entry to `status: done`.

## Why
- V4 uses the full width. Each box holds one subject, so the empty half of the old card goes.
- The summary state makes a saved setup about 100 px high. The form opens only when the user edits.
- K1 and K2 first: they give the visible gain without a new state. K3 then only adds the state and the test helper.
- The backtest modal is 896 px wide. Three boxes do not fit there.

## Risks

| Risk | Measure |
|---|---|
| The summary hides a setup with unsaved changes. | Rule 1108-A6.3: such a setup stays open. Test. |
| Up to 80 tests change in K3. | One helper; only an added call per test; reviewer checks that no assertion changed. |
| Fractal mode and BOTH split make the first box much taller. | Boxes keep the same height in a row; test at 375 and 1440 px with both modes. |
| Full e2e runs are heavy. | `heavy_lock.sh` runs them one at a time. |

## Open points
- [x] K1 header and logs
- [x] K2 fields
- [ ] K3 summary state
- [ ] K4 check and signatures
