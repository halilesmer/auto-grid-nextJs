---
date: 2026-11-20
author: Claude
type: fix
status: closed
pr: []
features: [MET-03, ANA-20, UI-08]
areas: [frontend, tests]
---

# MET-03 live test looked for the old floating card; legend test was already fixed

## Request
The full run on `main` v0.7.670 had two red tests that CI did not show: the 375 px legend test (clock-dependent) and the live read-only test MET-03 "WebSocket-Stream liefert Metriken".

## Cause
- Legend test: same cause as `2026-11-20-legend-375-clock-dependence.md`. PR 632 (fixed clock) is already in `main`. Checked again on this branch with `E2E_FAKE_NOW` 2026-11-20T05:30Z, 2026-11-19T05:30Z, 2026-11-21T10:00Z, 2026-11-22T10:00Z and 2026-11-16T00:30Z: all `ANA-20` tests (6) pass. The desktop legend test (`Lejant: imleç grafikten düğmeye…`) does not use "—" at the left edge, so it does not depend on the clock.
- MET-03: from lg the card is the side panel behind the right rail (`chart-panel`, PR 480, 2026-11-09). Only below lg is it the floating card. The live test still looked for `chart-floating-card`. PR 481 (same day) changed the test for the floating card, but the rail layout had already replaced it, so the test was stale from 2026-11-09. It was not seen because live tests do not run in CI.

## Change
`e2e/live/readonly.spec.ts` uses `openCardTab(page, 'overview')` (`e2e/fixtures/card.ts`), which opens the rail panel from lg and the floating card below. The check `chart-stat-price` is not `--` stays.

## Evidence
`E2E_LIVE=1 scripts/features/heavy_lock.sh npx playwright test --project=live-demo e2e/live/readonly.spec.ts` (DEMO, read only): 11 passed, MET-03 in 5.4 s.
