---
date: 2026-11-09
author: Claude
type: feature
status: open
pr: [479]
features: [BKT-23]
areas: [worker, backtest]
---

# Trigger-minute replay (worker endpoint and browser run)

## Request
Step 1 (PR-A, worker) of plan 1109-K57: the backtest must replay the fill and exit minutes of its own trades with real ticks. The worker must give the ticks of single minutes on request.

## Solution
| File | Change |
|---|---|
| `worker_python/src/api/market.py` | New `GET /market/{id}/replay?symbol&start&m`. Access: `account_access` (all roles, own accounts only; a foreign account gives 404). |
| `worker_python/src/utils/market_sync.py` | `parse_replay_minutes` (delta list, limits), `tick_rows_by_minute`, `get_replay_minutes` (2-hour pieces, one `copy_ticks_range` per piece, shared fetch slot, 40 s budget). |
| `worker_python/src/utils/market_db.py` | `store_replay_minutes`: `INSERT OR IGNORE` into `tick_replay` with kind `T`. The schema does not change. |

## Why
- `m` holds minute differences, not absolute times, so the URL stays short for 2 000 minutes. The first difference is relative to `start`.
- `INSERT OR IGNORE`: the existing S/J rows from BKT-20 must never be replaced.
- Minutes without a tick are stored as an empty `T` row only when they are at least 2 days old. The terminal can still load recent history.
- The endpoint is open to users, not only admins (decision K57.6). Ticks are market data and carry no account data. Limits: 2 000 minutes, 3 days span.

## PR-B (frontend)
| File | Change |
|---|---|
| `candles/loadReplay.ts` | New. Splits the minute list into requests (1 000 minutes, 3 days), reads `/replay`, converts points to prices. Any error gives "unavailable". |
| `runJob.ts` | Multi-pass loop per path (at most 4 passes, 5 000 minutes, 1 M ticks). Each path has its own replay map. Protocol lines are added to the finished log. |
| `runner.ts` | `RunModel.triggerReplay`, `RunResult.triggerMinutes`, `REPLAY_FILL_LATENCY_MS = 1`, `TRIGGER_REPLAY_DEFAULT = false`. |
| `broker/pathBroker.ts` | `fire(trigger, atMarket, quote?)` and `openEntryTimes()`. |
| i18n, `mock-worker.ts`, `backtest-trigger-replay-lib.spec.ts` | Protocol texts (tr/en/de), new mock endpoint, lib spec (@BKT-23). |

### Decisions in PR-B
- The default is OFF (`TRIGGER_REPLAY_DEFAULT = false`). Reason: decision K57.4 says the default stays closed until the 200050 difference is understood, and the acceptance run (step 3) is not done. The switch to ON is one line.
- No new control in the UI (K57.5). Only the log lines and one sentence in the spread hint.
- The quote is used only where the market price applies (`fill = gap`). In `parity` fill the order level stays.
- A minute with no tick from the worker is requested once. It is not requested again in later passes.
- If the worker has no endpoint or fails, the run stops after pass 1 and writes `run.triggerReplayUnavailable`. The result then equals the run without the switch.

## Open points
- Acceptance run (plan step 3): `bt11.mjs` on windows P6+ and P7, then the decision on the default (step 4).
- 200050 13:34:01 (B-only after the SL) is not explained yet.
