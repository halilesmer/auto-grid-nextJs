---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [FRM-07, FRM-12, FRM-13, FRM-14]
areas: [frontend]
---

# A fractal zone counts at D only when its fractal is confirmed (A46.1)

## Decision
The project owner decided on 2026-11-04 (1104-A46.1): a fractal zone counts for the zone rows `GAR-10`, `BAT-11`, `BUT-12`, `CRB-12` and `CYP-09` only when the fractal candle and its 2 right neighbour candles (`FRZ_PARAMS.neighbors`) are closed before D. A fractal is confirmed only then (FRZ-01 to FRZ-04). When price touches D, the trader can use only confirmed zones. D itself needs no candle close: a touch is enough (Gartley rule, GAR).

This replaces the rule of package D (PR #357), where only the fractal candle had to close before D.

## Change
- `zoneRectAt` (`xabcd.ts`) gives the rectangle of a fractal zone as it was visible at the time of D. A member of the zone counts when its fractal candle and its second right neighbour candle in the series of the zone timeframe are closed at that time. The result is the union of the counted members, or `null`.
- A merged zone keeps its older, confirmed members when a younger member is not confirmed yet. For this, `FrzZone` has a new field `members` (time and rectangle of each fractal candle). The zone formation is unchanged.
- The neighbours count as candles, not as seconds. A Friday fractal on D1 is confirmed after the Tuesday candle closes, not after 3 × 86400 seconds.
- If D is not reached, the row measures at the target price. A temporary extreme is not a D. The time of D is then unlimited, so the zones that exist now count (`atD` in `zonesNear` and `zonesNearOutsideX`; the five checks pass `reached`).
- Engulfing zones and the spike ratio (A49.1) are unchanged. The text of FRM-07, FRM-12, FRM-13 and FRM-14 in `features.yaml` has the new sentence.

## Tests
- `formation-boundaries-lib.spec.ts`: the D1 block of #357 became 8 cases for each of the 5 rows and both directions. D in the fractal candle, in the first or in the second neighbour candle: `unmet`. D opens when the second neighbour closes, and both neighbours closed: `met`. A Friday fractal with a weekend gap: D at the Monday open and in the Tuesday candle `unmet`, after the Tuesday candle `met`. Without the change, 40 of them were red. The filler candles rise slightly, so that no second fractal appears.
- New cases for the review findings (4 for each row and direction): a merged zone where the target is only in the unconfirmed younger member (`unmet`, then `met` after its confirmation); a merged zone where the target is only in the confirmed older member (`met`); D not reached and the zone confirmed now (`met`). A mutation of `zoneRectAt` that drops the whole merged zone makes 10 of them fail.
- Measurement over all `formation-*-lib` specs: before 1662 of 1662 green, after 1702 of 1702 green. The first version of the change dropped the whole merged zone and flipped `crb-deep-h4-01` (`CRB-12`, `met` to `unmet`). The review showed that the flip was wrong: the target lies in an older, confirmed member. With the corrected change, no real-candle test changes:

| Fixture | Row | Old | New |
|---|---|---|---|
| all fixtures of GAR, BAT, BUT, CRB, CYP | zone rows | unchanged | unchanged |

## Lessons
- A rule about "closed before D" needs the rule book definition of the object. A fractal is closed when its right neighbours are closed, not when its own candle is closed.
- A merged zone has the rectangle of the union. A test of a member time against D must use the member rectangles, or a young member removes an old, valid zone.
- A test series with flat filler candles makes a second fractal at the end of the series. Use slightly rising filler.
- A later low under an older support breaks the older zone. A test with two zones needs the younger low above the older low.
