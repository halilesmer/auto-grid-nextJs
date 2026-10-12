---
date: 2026-10-11
author: Codex
type: fix
status: done
pr: [153]
features: [ZON-13, ZON-20, UI-08]
areas: [frontend, tests, docs]
---

# Keep grid distance and loss switch together

## Request

| Item | Requirement |
|---|---|
| Position | Put the step-by-loss switch directly below the grid distance input. |
| Wrapping | Keep the input, price distance preview and switch together at all widths. |

## Cause

| Finding | Cause |
|---|---|
| Related controls were separated | Lot, TP and SL were between the grid distance and the step-by-loss switch. |
| Old layout tests | Tests required the switch beside SL and the grid input beside lot at 375 px. |

## Solution

| Area | Change |
|---|---|
| Grid fields | One flex column holds the input, preview and existing Switch, with an 8 px gap. |
| Shared editor | Dashboard setups and local backtest setups use the same grid fields. |
| Layout tests | Check both themes at 1440 and 375 px, BUY, SELL and BOTH, with and without loss amounts. |
| Mobile density | Keep the loss switch with the grid input. Check short inputs and lot after the block. Retain overflow checks. |
| Feature catalog | Update ZON-13 and ZON-20. |

## Why

The user selected a vertical group. The loss preview remains below the input, before the switch.
The group can wrap as one item. Its caption can move the lot field onto the next row on mobile.
The common Switch needs no empty field-label spacer. Conversion and save handlers stay the same.

## Verification

| Check | Result |
|---|---|
| Before implementation: `scripts/features/run.sh e2e ZON-13` | 16 new layout cases failed; two existing conversion tests passed. |
| Final `scripts/features/run.sh e2e 'ZON\|UI-07\|UI-08'` | 103 passed, no failures. Checklist: 139/157 checked. |
| `npm run lint` | Exit 0 after replacing a nested ternary in the new test. |
| `npx tsc --noEmit` | Exit 0. |
| `scripts/features/run.sh check` | 157 features; catalog valid. |
| Initial Turbopack build | Port helper failed with `Operation not permitted`. |
| Mocked production build | Used `next build --webpack` temporarily; the standard config is restored before commit. |
| Diff review | No API, access, worker or settings behavior changed. `git diff --check` returned exit 0. |
| Screenshots | Desktop and mobile, light and dark: switch below the grid field and preview. |

