---
date: 2026-11-19
author: Claude
type: decision
status: done
features: [UI-15]
areas: [chart, tests]
---

# /chart top bar: gray placeholders while the account list loads

## Request
Plan 1119-A9.1 (Halil, 2026-11-19, "B: placeholder"). While the account list loads, `/chart` showed an incomplete top bar. When the list arrived, `OneChart` replaced the whole page and the bar moved (open point in `2026-11-17-ui15-phone-topbar-measure-race.md`).

## Decision
- On the desktop layout (docked bar, container 30 rem or wider), the bar shows its final layout at once. The symbol and the timeframes have gray placeholders. The chart area shows a plain "loading" text (`chart-loading`).
- The placeholders are not controls. They are `div`/`span` with `role="status"` and `aria-busy="true"`, so they need no tooltip (UI-07 does not apply).
- The phone layout (container under 30 rem) keeps the old loading state. Reason: phone UI waits (Halil, 2026-11-17).
- `useChartContext` returns `accountsPending`. It is true until the first load attempt ends. If the first attempt fails, the placeholders go away and the old notices show; the 10-second retry continues.

## Deviation from the brief
The symbol placeholder always has the width `w-44`, the same as the real symbol field. A width based on the `symbol` in the URL would move the bar when the list arrives. The URL symbol is not shown as text, because it is not yet verified.

## Evidence
- `e2e/mocked/chart-topbar-loading.spec.ts` (@UI-15): holds `GET /accounts`, checks the placeholders, releases, and measures account, date range and timeframes in one `evaluate` call: maximum 1 px shift. Red without the change (the placeholders did not exist), green with it.
- The account select also shows a gray placeholder with "Hesaplar yükleniyor…" (desktop), not "Bir hesap seçin" (coordinator review of the first screenshots). Same width as the real select.
- Other tests that read `chart-topbar` stay green. With `GET /accounts` delayed by 1.5 s (temporary change in the mock, not committed), `chart-header`, `chart-topbar`, `formation-page`, `formation-past` and the new spec pass. The delay found two alarm tests (FRM-30, FRM-32) that clicked the alarm button of the loading bar; they now wait for `timeframe-select`. The six tests of the open point in `2026-11-17-ui15-phone-topbar-measure-race.md` were already safe; that point is closed.
