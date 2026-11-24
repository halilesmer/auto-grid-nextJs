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

- Rules wired to the arrow: B break for Butterfly (BUT-06), Crab (CRB-05), Cypher (CYP-15). The reason drawing for a shallow B only for Butterfly (BUT-02). Other patterns (AB=CD, Gartley, Bat) show the D arrow from the existing D level, and "Geçersiz · rule" when invalid. The B depth of Crab, Cypher, Gartley and Bat is not wired yet.
- The pip size comes from `pipOf(symbol)`; `FormationLayer` got a `symbol` prop from `OneChart` and `FormationChart`.
- Not changed: "D follows the extreme wick after the trade stopped" is a separate defect.

## Short gap
When B is less than 30 px from the needed level, the red arrow and its text do not fit. Then the arrow is not drawn and "n pip eksik" joins the one line of the level label. The level label stands on the side of the line away from B; the B label stands on the other side, so they never touch. Labels are right-aligned, so they do not leave the chart. Both cases have a real series: 0.2 pip short (AUDUSD) and 217.9 pip short (EURJPY).

## Screenshots
All in `docs/journal/images/`, name `2026-11-24-formation-d-arrow-<state>.png` (`wait`, `near`, `bBreak`, `invalid`, `invalidShort`, `done`; `-hover` is the same with the hover text).

## Tests
- `e2e/mocked/formation-d-arrow-lib.spec.ts` (@FRM-49): states on real candles of the Butterfly fixtures, texts in tr, en, de.
- `e2e/mocked/formation-d-arrow.spec.ts` (@FRM-49): the five states on the page, hover, reduced motion. The "D near" case moves the last close of a real series to 3 pips above the D level, because no real series has a rest under 5 pips.
