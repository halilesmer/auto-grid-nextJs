---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: []
features: [UI-15]
areas: [frontend, docs]
---

# Account and target names in row 1 of the top bar at 375 px

## Request
Open point of `2026-11-03-chart-topbar-compact.md`: at 375 px the names of the account and the setup are cut in row 1. The owner chose design C on 2026-11-04 ("Inhaltsbreite statt 50/50").

## Cause
Row 1 split the width into two equal halves (`flex-1` with `basis-2/5` on both slots). The target (symbol or setup) used half of the row, although a symbol name is short. The account lost 32 px more to the LIVE/DEMO tag.

## Solution
Only below 30 rem container width (the phone rule). The target takes the width of its content, at most 42 % of the row. The account takes the rest.

| File | Change |
|---|---|
| `components/chart-page/ChartTopBar.tsx` | Account slot: `flex-1 basis-[56%]`. Target slot: `flex-[0_1_auto] max-w-[42%]`. |
| `components/chart-workspace/FreeChartPanel.tsx` | The symbol field is 8.5 rem wide (`w-34`, `flex-none`) on the phone. New test id `chart-symbol`. |
| `components/formation/FormationSelectors.tsx` | Same width and the 42 % limit for the symbol field of the Formation mode. |
| `e2e/mocked/chart-header.spec.ts` | Three new tests (Formation, Free, Setup) at 375 x 812 with a long account name: the target is at most 42 % of the row, the account is wider than the target, the page has no horizontal scroll. |

The `(i)` stays 16 px. Tooltips and tab order do not change. At 812 x 375, 375 x 812 (other rows) and 1440 x 900 nothing changes: the classes use the container query below 30 rem only.

## Measured (production build, mock worker, account name of 33 characters)
| Mode | Row | Target | Account button |
|---|---|---|---|
| Free | 375 px | 136 px | 250 px |
| Setup | 375 px | 151 px | 250 px |
| Formation | 319 px | 114 px | 139 px |

Before the change the account had about half of the row minus the tag. In Formation the gain is small (about 14 px), because the symbol field keeps its 8.5 rem for the `(i)` and the flag. Names longer than about 28 characters are still cut; the tooltip of the field shows the full name.

## Lessons
- With `basis-0` for the account the mode segment fitted into row 1 and the range picker in row 2 grew wider than the phone (page width 466 px on the Statistics view, test `UI-15` 375 x 812). A basis of 56 % keeps the segment in row 2.
- The first test run failed on a stale build. Run the e2e command again after the build has finished before you trust a red result.

## Known limits
- The symbol fields have a fixed width (8.5 rem, at most 42 %), not the width of their content. Symbol names longer than about 10 characters are cut at 375 px; before, the field had half of the row.
- On the Statistics view without a known account the target slot is empty. The slot is then 0 px wide and the mode segment can move into row 1. No test covers this.

## Verification
UI-15, UI-10, UI-11, UI-14 and FRM-22 e2e tests (see the PR). `tsc` and `lint` show no new messages.

## Open points
None.
