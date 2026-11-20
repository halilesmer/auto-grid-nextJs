---
date: 2026-11-19
author: Claude
type: decision
status: done
pr: []
features: [UI-18, UI-26, ANA-18, UI-19]
areas: [frontend]
---

# Oscillator panes: arrow, scale labels, legend strip and the rulebook settings (1119-B1)

## Request
Halil, 2026-11-19, with a screenshot of the RSI and EWO panes on `/chart`. Design page with one picture for each item: https://claude.ai/artifact/WrgHdk4deR3y2RNvmtjUGY. Halil approved B1.1 to B1.4 ("Hepsi onaylı") and B1.5 ("B1.5 onaylı").

## Decisions
| Code | Change | File |
|---|---|---|
| B1.1 | The "latest candle" arrow sits at the bottom edge of the price pane, 8 px above the line where the oscillators start. It measures pane 0 with a ResizeObserver and `PANES_CHANGED_EVENT`. Before it was fixed at 96 px from the bottom and fell into the RSI pane. | `LatestBarButton.tsx` |
| B1.2 | RSI and EWO have no name/value label on the price scale. Set `lastValueVisible: false` and also `title: ''`: lightweight-charts draws the title box on the scale when the value label is off. MACD and ATR are not changed. | `runtime.ts` |
| B1.3 | The upper and lower band values of an RSI (80 and 20) are price line labels on the scale, so they show at every pane height. The middle line (50) has no label. | `runtime.ts` |
| B1.4 | New RSI and EWO start with the rulebook settings (`RULEBOOK_SETTINGS`, from `RSI_PARAMS` and `WAVE_PARAMS`): RSI 7, close, 80/20, no smoothing (SIG-01); EWO SMA 5 − SMA 35 of hl2, a price difference, not a percent (SIG-10). Before the chart EWO used close and percent, which differed from the formation rules. | `indicators.ts` |
| B1.4.1 | Menu entry "Kural kitabı ayarları" in the defaults menu of the settings dialog (RSI and EWO only). It sets the calculation values and keeps look and place. Cancel undoes it until OK. Halil asked for it in this menu (screenshot) instead of a separate button. The label names the rulebook, as the other texts of the app do: the public repository does not name the source of the rules. | `IndicatorDialog.tsx`, `i18n/messages/indicatorDialog.ts` |
| B1.5 | Legend strip of 22 px at the top of every oscillator pane (RSI before: 32 px; others: 8 % of the pane). The legend row starts 1 px below the pane edge; in oscillator panes the row is 20 px high. The pane tiles stay 34 px (UI-11): the design did not change them, and a first version with 20 px tiles failed the UI-11 test. | `runtime.ts` (`OSC_LEGEND_PX`), `IndicatorLegend.tsx` |

## Not changed
- A saved oscillator standard (`chart_osc_standard`) and saved indicator defaults keep their values. The user applies the rulebook values with the menu entry, then "Varsayılan olarak kaydet" if new indicators must start like this.
- The backtest page RSI also starts with the rulebook values now (length 7 instead of 14).
- The 5/35 of the EWO is still an assumption (SIG-10: the rulebook gives no number).

## Tests
- `chart-indicators.spec.ts`: rulebook defaults and `withRulebookSettings`; the Wilder worksheet test now names length 14 and SMA 14 (the worksheet is for 14), the expected numbers did not change; the EWO default is the price difference of hl2 (15), the percent of close (37.5) is tested with explicit values.
- `chart-single-rsi.spec.ts`: scale `20:80:22:10`, band labels `80:20`, no value label.
- `chart-latest-bar.spec.ts`: the button ends within 20 px above the bottom of the price pane.
- `chart-indicator-dialog.spec.ts`: the menu entry sets the RSI values; MACD has no entry.
- `chart-workspace.spec.ts`: the formula of a new RSI shows length 7; the 375 px legend test failed on 2026-11-20 because of the mock clock, not because of this change; main fixed it in the meantime with a fixed clock, and this PR uses that version.
- `chart-view-like-tradingview.spec.ts`: the range start is -1e-13 after the change, `Math.round` gives -0 and `toEqual` tells -0 apart from 0; the test adds `+ 0`.
- Run: 8 related spec files, 79 passed. Screenshots with the mocked worker were checked by eye (light theme not checked; phone width not changed by rule).
