---
date: 2026-11-13
author: Claude
type: decision
status: done
pr: []
features: [FRM-13]
areas: [frontend]
---

# A real valid Butterfly buy fixture: but-buy-h4-02

## Request

Plan 1113-A17.2. After the A/B extreme-wick shift (`2026-11-13-xabcd-a-b-deepest-wick.md`), `but-buy-h4-01` is invalid on purpose (B at 0.905 of X → A, over the 0.886 exclusion BUT-03). Only hand-built series tested a valid Butterfly buy. A valid buy on real candles was missing.

## Method

- Source: the 108 real candle files in `frontend_nextjs/e2e/fixtures/formation/` (H4 and D1). No rule, parameter or candle was changed.
- For each file, each trend setting (Mindestgröße 0.5 to 3.5 ATR, 1 or 2 closes) and each closed candle, `analyzeBut` ran with that candle as the last one. The scan kept every buy candidate with the verdict `valid`.
- Result: 605 valid rows in 34 files. Most rows are the same points seen on later candles, or the same real series used by more than one fixture.

## Choice

The `GBPUSD` H4 series in `cyp-sell-h4-01` (same candles also in `crb-sell-h4-01` and `obo-buy-h4-02`) gives a valid buy with the default fixture trend (0.5 ATR, 2 closes), so no `FIXTURE_TRENDS` entry is needed. Reasons: D is the first candle past 1.272, five of seven bonus filters are met, and every core value has a clear margin.

The file `but-buy-h4-02.json` is an unchanged copy of `cyp-sell-h4-01.json`. It is evaluated after the candle of D (2025-11-19 12:00).

| Point | Time (H4 open) | Price |
|---|---|---|
| X | 2025-11-17 08:00 | 1.31354 |
| A | 2025-11-17 12:00 | 1.31925 |
| B | 2025-11-18 04:00 | 1.31444 |
| C | 2025-11-18 08:00 | 1.31763 |
| D | 2025-11-19 08:00 | 1.31172 |

| Rule | Value | State |
|---|---|---|
| BUT-01 form | impulse, alternating | met |
| BUT-02 B at or past 0.786 | 0.843 (margin 0.057) | met |
| BUT-03 B under 0.886 (exclusion) | 0.843 (margin 0.043) | not triggered |
| BUT-04 C at or past 0.382 | 0.662 | met |
| BUT-05 C under 0.886 (exclusion) | 0.662 | not triggered |
| BUT-06 close beyond B | - | met |
| BUT-07 D at or past 1.272 | 1.318 (margin 0.046) | met |
| BUT-08 to BUT-12 | C 0.662; 0.286, 0.204, 0.322 ATR; zone | met |
| BUT-13 RSI(7) at D | 35.4 | not met |
| BUT-14 divergence | - | not met |
| BUT-15, BUT-16 | no higher or lower timeframe in the fixture | not measurable |

Verdict: valid. The test is in `e2e/mocked/formation-but-lib.spec.ts` (FRM-13). Each rule value is in the test comment.

## Notes

- `but-buy-h4-01` stays as the negative case. A comment in its test names `but-buy-h4-02` as the valid partner.
- Other valid buys exist (for example GER40 H4 2025-07-18 with D at 1.397, but only on a small swing). They were not added. One valid real buy is enough for this item.
- Later D candles of the same swing (11-19 12:00 and after) stay valid up to D at 2.7. The fixture tests the first one.
