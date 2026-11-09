---
date: 2026-11-09
author: Claude
type: defect
status: done
pr: []
features: [UI-22, FRM-37]
areas: [frontend]
---

# Collapsed chart card covers the price scale (1107-A21.21)

## Symptom
At 1024 px the collapsed card header sat over the right edge of the chart and covered the price scale (U4-6 live check, `images/2026-11-09-u4-6-card-collapsed-1024.jpg`).

## Diagnosis
- Reproduced in the mocked e2e build. The cause is a defect, not a moved package.
- A collapsed card (from lg) used a fixed offset `lg:right-[84px]`. The price scale of the chart is 62 px wide with short prices, so 22 px stayed free (measured at 1024, 1100 and 1440 px, also after a reload and with the stored "closed" state).
- The price scale gets wider with long prices or with order tags (the live image shows a "BUY LIMIT" tag). With a scale wider than 84 px the card covers it. Measured with prices of 8 digits: scale wider than 84 px, overlap 12 px at 1024, 1100 and 1440 px.
- Moving a package with the toolbar arrow does not change this: the card position does not depend on the dock.

## Fix
`FloatingCard.tsx` measures the price scale cell of the chart (ResizeObserver plus MutationObserver on `formation-main`) and sets `--card-right = max(84, scale width + 22) px`. The layout of the closed card is unchanged: same place, same size. The open card is not affected.

## Test
`e2e/mocked/chart-one-chart.spec.ts` (`@UI-22`): "closed card does not cover the price scale" at 1024, 1100 and 1440 px, with a stored closed card, before and after a reload, with a scale wider than 84 px. Red before the fix (overlap 12 px), green after.

## Lesson
A fixed offset next to a canvas scale of variable width fails. Measure the scale.
