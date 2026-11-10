---
date: 2026-11-10
author: Claude
type: decision
status: open
pr: []
features: [BKT-23]
areas: [frontend, backtest]
---

# Trigger-minute replay is on by default

## Request
Plan 1109-K57.3 and K57.4: measure the replay against the live trades of the DEMO account. Then decide if `triggerReplay` is on by default. Earlier entries: `2026-11-09-trigger-replay-worker-endpoint.md` (PR 479 and PR 482).

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/backtest/runner.ts` | `TRIGGER_REPLAY_DEFAULT` changes from `false` to `true`. |
| `frontend_nextjs/e2e/mocked/backtest-trigger-replay-lib.spec.ts` | One case checks the default (replay runs). Another case checks `triggerReplay: false` (no replay request). |
| `docs/features/features.yaml` | BKT-23 says the default is on. |

No new button exists (K57.5). `triggerReplay: false` still switches the replay off.

## Why
Two acceptance runs compared the backtest with the live trades of the DEMO account (read-only, window start 21:00 UTC).

**Acceptance A** (window P6+, 11-08 21:00 to 11-09 16:18 UTC):

| Value | Without replay | With replay |
|---|---|---|
| Unmatched trades | 20 | 9 |
| Entries with the exact live price | 57.4 % | 97.7 % |
| Exits with the exact live price | 43.8 % | 97.9 % |

Setup 200050 has one K4 trade that is a bot-timing case (class b). It stays in the report as a known deviation (decision 1110-K2.1). K4 was not relaxed.

**Acceptance B** (window P7, 11-09 21:00 to 11-10 21:00 UTC):
- The first run started 11 minutes after the window end. It had incomplete candle data and failed: 31 unmatched trades (S2 also had 36).
- A second run used the same code and the same window with complete data. It passed: 7 unmatched trades, entries 97.4 %, exits 96.1 %, K-class worsened 0 times (decision 1110-K3.2).

The first failure came from missing data, not from the replay. So K57.3 and K57.4 close, and the default changes.

## Verification
- Mocked e2e `backtest-trigger-replay-lib.spec.ts` (@BKT-23): see the PR for the `precheck.sh` result.
- VPS acceptance: the two runs above.

## Open points
- [ ] c2: orders that wait at the start of the window.
- [ ] b: placement delay of the bot.
- [ ] Data completeness before an acceptance run (1110-K3.3).

## Lessons
Check that the candle data is complete before you read a failed acceptance run as a code fault.
