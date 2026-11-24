---
date: 2026-11-24
author: Claude
type: feature
status: done
pr: []
features: [FRM-49, FRM-44]
areas: [formation, chart]
---

# D arrow before the D point (1124-F2)

## Request
A harmonic pattern showed X-A-B-C, but the chart did not say where the price must go before D forms. An invalid pattern looked like a forming one (USDCHF M15 Butterfly: B reached only 0.552 of XA, rule BUT-02 not met, no sign on the chart). Halil approved the design on 2026-11-24.

## Solution
New pure module `frontend_nextjs/src/lib/formation/dArrow.ts` (`layoutDArrow`). `FormationLayer.tsx` draws its model. The old drafts 1124-A1/A3 were not used.

| State | Drawing |
|---|---|
| D waits | D level of the pattern is strong ("D hedefi · XA 1,272" for Butterfly). Dashed arrow from the last close to the D ring. Pill: side, D price, pips left. |
| D near (5 pips or less) | Same, and the ring pulses (`motion-safe`, so not with reduced motion). |
| B break missing | Arrow goes to B, D level is faint. Pill: "B price · kırılma bekleniyor". |
| Invalid | No arrow, no ring. D level is faint ("D aranmıyor · formasyon geçersiz"). Pill "Geçersiz · reason". |
| Invalid, B too shallow (BUT-02) | Also: red line at the needed level (XA 0,786), red arrow from B, "n pip eksik", B ringed red. |
| D formed | No arrow. The entry and stop drawing is unchanged. |

- Rules wired to the arrow (Halil's decision: the B reason drawing also for Gartley and Bat):

| Pattern | B break (arrow to B) | B too shallow (reason drawing) | B too deep (reason drawing) | D level |
|---|---|---|---|---|
| Butterfly | BUT-06 | BUT-02 (XA 0,786) | none (BUT-03 gives only the pill) | XA 1,272 |
| Gartley | none | GAR-03 (XA 0,618) | GAR-15 (XA 0,786) | AB 1,272 |
| Bat | none | BAT-05 (XA 0,5) | BAT-14 (XA 0,618) | XA 0,886 |
| Crab | CRB-05 | CRB-06 (XA 0,382) | no rule | XA 1,618 |
| Cypher | CYP-15 | CYP-03 (XA, first level of Z-CYP-01) | no rule | XC 0,786 |
| AB=CD | none | no rule: there is no point X | none | existing D line |

- Each level comes from the drawing of the pattern itself: `Z-GAR-02`, `Z-BAT-02`, `Z-CRB-01`, `Z-CYP-01`, `Z-BUT-01` (fib X → A, price = A + ratio × (X − A)). Too deep shows the red line at the limit, the arrow from B back to it and "n pip fazla".
- If a pattern is invalid for several reasons, the B depth wins as the drawn reason; the other rules stay in the side panel.
- Real series: Gartley GAR-03 `gar-buy-h4-01` 2025-11-21T04:00, GAR-15 `gar-buy-h4-02` 2025-10-16T04:00, Bat BAT-05 `bat-bad-h4-01` 2025-10-20T20:00, BAT-14 `bat-buy-h4-01` 2025-10-15T04:00. Crab CRB-06 and Cypher CYP-03 have the rule wired and are covered by the same code path, but have no own test (no series with only that cause was found for Crab, Cypher was not scanned).
- The pip size comes from `pipOf(symbol)`; `FormationLayer` got a `symbol` prop from `OneChart` and `FormationChart`.
- Not changed: "D follows the extreme wick after the trade stopped" is a separate defect.

## Short gap
When B is less than 30 px from the needed level, the red arrow and its text do not fit. Then the arrow is not drawn and "n pip eksik" joins the one line of the level label. The level label stands on the side of the line away from B; the B label stands on the other side, so they never touch. Labels are right-aligned, so they do not leave the chart. Both cases have a real series: 0.2 pip short (AUDUSD) and 217.9 pip short (EURJPY).

## Screenshots
All in `docs/journal/images/`, name `2026-11-24-formation-d-arrow-<state>.png` (`wait`, `near`, `bBreak`, `invalid`, `invalidShort`, `invalidGar`, `invalidGarDeep`, `invalidBat`, `invalidBatDeep`, `done`; `-hover` is the same with the hover text).

## Tests
- `e2e/mocked/formation-d-arrow-lib.spec.ts` (@FRM-49): states on real candles of the Butterfly fixtures, texts in tr, en, de.
- `e2e/mocked/formation-d-arrow.spec.ts` (@FRM-49): the five states on the page, hover, reduced motion. The "D near" case moves the last close of a real series to 3 pips above the D level, because no real series has a rest under 5 pips.
