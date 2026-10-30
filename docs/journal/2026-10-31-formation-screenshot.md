---
date: 2026-10-31
author: Claude
type: feature
status: done
pr: []
features: [FRM-26]
areas: [frontend, tests]
---

# Formation page gets a screenshot tool

## Request
- Add a tool to `/formasyon` that saves a formation with its conditions as an image.
- The image must not show the account name or number, because people share screenshots.
- The approved design is a camera button with a menu (download, copy). The image theme follows the app theme.

## Solution
| File | Change |
|---|---|
| `FormationShotMenu.tsx` | Camera button after the timeframes, menu with PNG download and copy. |
| `shotImage.ts` | Builds the image on a canvas: header, chart picture, conditions, footer. |
| `shotData.ts` | Texts and file name for the image. No account data. |
| `FormationChart.tsx` | Gives the page a function that captures the chart with its drawings. |
| `FormationToolbar.tsx` | New `actions` slot behind the timeframes. |
| `page.tsx` | Connects the button, the chart and the data of the selected candidate. |

## Why
`chart.takeScreenshot()` of lightweight-charts 5.2.1 returns only the chart canvases. The formation drawings are an SVG overlay above the chart, not chart primitives, so they are not in that picture. The tool puts the overlay on top of the chart picture in the same coordinate system. The overlay uses `var(--…)` colors, so the tool replaces them with the resolved theme values before it draws the SVG as an image.

We did not add an image library (such as html2canvas). The header and the condition list are drawn directly on the canvas. This keeps the dependency list the same.

The image is 1200 CSS pixels wide at double resolution. When the chart is narrower than 640 px (phone), the chart stands on the left and the conditions on the right. This keeps the image from becoming very tall.

The file name holds formation, symbol, timeframe and scan time. It holds no account data.

The image shows the chart as it is on the screen. When the "Formations" switch hides the drawings, the image has no drawings. The image has no marks for secondary sources or assumptions, and no note line, because the approved design did not include them.

## Verification
- `npx tsc --noEmit` and `npx eslint .`: no errors.
- `e2e/mocked/formation-page.spec.ts` and `tooltips.spec.ts` (UI-07): green. Under load with four workers, three older tests ran into the 30 s timeout. They passed when run alone.
- Not tested: the copy action in Safari and Firefox, and a real account on the VPS.
