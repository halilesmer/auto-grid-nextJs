---
date: 2026-11-25
author: Claude
type: fix
status: closed
features: [FRM-49]
areas: [frontend]
---

# D arrow follow-up (1124-F11.1): labels no longer overlap, ratio has 3 digits, the dashed arrow flows

## Request
After PR 680 (1124-F2) three defects were open. Halil: "Evet, sonra düzelt" and "Kesik çizgi aynı görseldeki gibi hareketli olacak, oka doğru hareket edecek".

## Change
- Overlap: the labels at the right side of the chart (pill, "D?" badge, level text) covered the reason texts (line label, B label) and each other. New `src/lib/formation/labelFit.ts` (`separateLabels`): fixed texts (reason, ring) stay; the pill, the "D?" badges and the level text move vertically to the nearest free place. `FormationLayer` calls it after both layouts. Text widths are estimates (characters × 6.4 px), on purpose a little too wide.
- Ratio: `layoutDArrow` takes `ratio`, a formatter with exactly 3 digits and the local decimal sign. The reason pill reads "B 0,948 > 0,786" (tr/de) or "B 0.948 > 0.786" (en).
- Flow: the arrow line has the class `d-arrow-flow` (`globals.css`): `stroke-dashoffset` goes to -11 (one dash period of "6 5") in 1.2 s, only under `prefers-reduced-motion: no-preference`. A negative offset moves the dashes toward the line end, the D. An invalid pattern has no arrow, so nothing flows.

## Tests
- `formation-d-arrow.spec.ts` (@FRM-49): "Etiketten überdecken sich nicht" for each state (bounding boxes must not meet; red before the fix for 5 invalid states), "Pfeil fließt zum Ziel" (animation name set, keyframes end at -11), reduced motion has no animation, invalid has no arrow, the reason pill matches `B \d,\d{3} [<>] \d,\d{3}`.
- `formation-d-arrow-lib.spec.ts` (@FRM-49): the badge matches the 3-digit pattern.

## Result
![Invalid Gartley: reason pill "B 0,948 > 0,786", labels apart](images/2026-11-25-d-arrow-followup-invalid-gartley.png)
