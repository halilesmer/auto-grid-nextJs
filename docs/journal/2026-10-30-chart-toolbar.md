---
date: 2026-10-30
author: Codex
type: feature
status: done
pr: []
features: [ANA-17, FRM-22, FRM-23, FRM-24, UI-07, UI-08]
areas: [frontend, tests, docs]
---

# Vertical chart tools and local linking

## Request
- Implement the approved TradingView-style toolbar in analysis, formation and backtest.
- Add the visible controls, local drawing links and three translated interfaces.
- Preserve existing drawing tools, replay behavior and private documents.

## Solution
| File | Change |
|---|---|
| `DrawingToolbar.tsx` | Vertical groups, separate menu arrows, last tools, symbol picker and favorite icons. |
| `ChartGestureLayer.tsx` | Temporary price/candle measurements and rectangle zoom through public chart APIs. |
| `ChartWorkspace.tsx` | Global locks, visibility, confirmations, history and shared drawing adapters. |
| `toolbar.ts` | Validated toolbar preferences and drawing groups; volume tools remain excluded. |
| `linkedDrawings.ts` | Explicit source/account/symbol identity, lossless initial merge and remote-addition preservation. |
| `useChartWorkspaceStore.ts` | Backward-compatible metadata, separate private/shared documents and local images. Web Locks serialize tab writes. |
| `dropdown-menu.tsx` | Optional right-side menus use the browser top layer and viewport bounds. Keyboard focus returns to the trigger. |
| Chart callers | Pass explicit identities. CSV imports retain their input source. Formation reserves room for the rail. |

## Why
The approved design keeps the left rail on narrow screens. The old tool selector was removed.
A right-side panel inside a scrolling rail needs the browser top layer. A body portal would lose workspace selection boundaries.
The private drawing document remains intact when linking. Unlinking restores this original document.
Only drawings and local image bytes belong to a shared document. Indicators and trading overlays remain context-specific.
Replay visibility and global locks are transient manager flags. Saved drawing properties retain the user's original values.
Web Locks protect read/merge/write across tabs. An incoming storage event waits for pending local writes.

## Verification
| Check | Result |
|---|---|
| Merge test sensitivity | Disabling the merge caused the ID-conflict test to fail. Restoring the implementation passed all three data tests. |
| Initial browser checks | Found scroll-triggered menu closing and Escape handling. Both causes were corrected. |
| Dialog interaction | Tooltips intentionally consume the first Escape. The lock test now uses the explicit dialog close button. |
| Intermediate checks | TypeScript, ESLint and webpack production builds passed. Final verification follows below. |
| First broad regression | 200/208 passed with four workers. Formation bounds still expected the old full-width canvas. The checks now reserve exactly 52 px for the rail; formation overlays and drag bounds leave it reachable. Two storage/label tests now wait for async persistence and include the switch info label. Three remaining timeouts are rerun serially without weakened assertions. |
| Final checks | `npm run lint`, `npx tsc --noEmit`, and the mocked webpack production build passed. `E2E_PORT=3337 PLAYWRIGHT_JSON_OUTPUT_NAME=../.feature-results/e2e.json npx playwright test --project=mocked --workers=1 --reporter=list,json --grep '@ANA\|@UI-07\|@UI-08\|@BKT-07\|@FRM-2'`: 208/208 passed (10.8 min). `scripts/features/run.sh check`: 190 valid features. `scripts/features/run.sh render` regenerated the checklist from the final report. `git diff --check` passed. |
| Visual review | Inspected final 375 px light and 1440 px dark toolbar screenshots, plus mobile dark and desktop light formation screenshots. Menus, favorite stars, rail and formation overlays remain reachable. |
| Live trading | Not run. Tests use a mocked worker. |

## Review
| Area | Result |
|---|---|
| Scope | No worker, authentication, trading engine or version-file changes. |
| Identity | Source, account and exact symbol are explicit. Views link only by opt-in; CSV imports remain isolated. |
| Persistence | Original documents and image bytes remain stored. Identical drawing IDs deduplicate; conflicts retain both contents. |
| Replay | Future anchors use the existing transient replay mask. Shared snapshots omit this mask. |
| Lifecycle | Existing disposal contracts remain in use. New managers receive the current magnet, lock and drawing-mode settings. |
| Browser limit | Without Web Locks, local storage works but simultaneous writes are not fully serialized. |

## Open points
- [x] Complete the affected browser regression run and inspect the final screenshots.
- [ ] Publish the branch as a pull request and inspect its checks.

## Lessons
Keep menu panels in the workspace DOM tree. Use the browser top layer to escape clipping without losing selection boundaries.
Do not reload external storage while a local write waits for its browser lock.
