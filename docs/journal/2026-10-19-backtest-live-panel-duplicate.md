---
date: 2026-10-19
author: Claude
type: fix
status: done
pr: []
features: [BKT-14, BKT-08]
areas: [frontend, tests]
---

# Backtest page: live panel shown many times, small values shown as 0

## Request
A dry run with 24 setups on `/backtest` showed two defects. First, the panel "Canlı karşılaştırma" appeared about 22 times after six setups were added. Second, the setup cards showed an EURCHF step of 0.0004 as "Adım 0".

## Cause
**Duplicate panel.** `BacktestView.tsx` rendered `LiveCompareSection` and `CsvImportPanel` as siblings in one `div`. Both had `key={accountId}`. React warns about two children with the same key. With a duplicate key, React can render a child again on each later update. The panel grew with each setup added.

It is not an HMR effect. The new test failed in a production build: 6 panels after 5 clicks on "Seçili setup'tan ekle".

**Rounding.** `SetupCards.tsx` formatted the grid step and the take profit with `fmt.number` and its default of 3 decimals. The lot already used 8 decimals.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/components/backtest/BacktestView.tsx` | The keys are now `live-<account>` and `csv-<account>`. They are unique among the siblings. |
| `frontend_nextjs/src/components/backtest/SetupCards.tsx` | Step, take profit and lot use up to 8 decimals (`FULL_DECIMALS`). |
| `frontend_nextjs/e2e/mocked/backtest-live-panel.spec.ts` | Two new tests: `@BKT-14` (one panel, no key warning) and `@BKT-08` (card shows 0,0004 and 0,00085). Both were red before the fix. |

## Why
The keys stay on the two components, because they reset the state of each panel when the account changes. Only the two key values changed.
