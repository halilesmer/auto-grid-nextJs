---
date: 2026-10-16
author: Claude
type: fix
status: open
pr: [182]
features: [SYS-06]
areas: [worker, tests]
---

# SYS-06: multi-terminal pipe check and connect budget

## Request

- Fix the 3 deviations of the manual check SYS-06 on 2026-10-16.
- Setup: worker v0.7.227, Windows VPS with 4 MT5 terminals, DEMO account A. A bot of account B ran on a different terminal.

## Cause

| # | Symptom | Root cause |
|---|---|---|
| 1 | Python integration off, terminal older than 30 s. "Start Bot" returned `-10004` after 205 s, not the clear message. | `python_pipe_state()` returned `unknown` when the pipe of a different terminal was open. On a VPS with more terminals, this is always true. Thus the worker never gave the message. |
| 2 | The budget of 120 s took approx. 205 s. | Without the Python pipe, `mt5.initialize()` waits a fixed 60 s ("Pipe server didn't answer in 60 sec"). It ignores a smaller `timeout`. The worker started a second attempt and a terminal restart with less than 60 s left. |
| 3 | The worker did not answer any request for approx. 3 min, also `GET /api/system/worker/status`. | Not verified. All MT5 calls of `/start` run in threads (`asyncio.to_thread`). `worker_status` has no MT5 call. Thus the most probable cause is that the `MetaTrader5` library keeps the Python GIL during `initialize()`. The WebSocket stream also called MT5 from a second thread while `initialize()` ran. |

## Solution

| File | Change |
|---|---|
| `worker_python/src/utils/mt5_errors.py` | `python_pipe_state()` counts the terminal pipes (not `MT5.Terminal.Debugger.*`). It returns `missing` if the own pipe is missing and there are fewer terminal pipes than `terminal64.exe` processes older than 30 s (any path). |
| `worker_python/src/utils/mt5_helpers.py` | `_INIT_NO_PIPE_BLOCK_SEC = 60`. A further `initialize()` starts only if 60 s remain or the own pipe is open (`_attempt_fits`). The first attempt keeps `_RESTART_MIN_SEC` (64 s) plus `_RESTART_BUFFER_SEC` (5 s) for a restart. After a kill, the retry needs only `_MIN_ATTEMPT_SEC`, because only `initialize()` opens the terminal again. |
| `worker_python/src/api/ws_server.py` | `fetch_mt5_data()` takes `_MT5_LOCK` without a wait. If a connection holds the lock, the stream uses the bot metrics for that round. |
| `worker_python/tests/unit/test_mt5_connect.py` | The simulator waits a fixed 60 s when the pipe never comes. It knows terminals of other accounts. New tests for 1 and 2. |
| `worker_python/tests/api/test_ws_stream.py` | New test for 3. |

## Why

- Risk of the pipe name: the worker computes the name from `os.path.realpath()`. The library uses `GetFinalPathNameByHandle`. A junction or a different drive letter can give a different name. Then each running terminal has a pipe, the count is equal, and the result stays `unknown`. The worker then connects as before.
- Remaining risk: the name does not match, and a different old terminal also has no pipe. Then the worker reports `missing` by mistake. This needs 2 faults at the same time.
- A young terminal of a different account (less than 30 s, no pipe yet) does not count. Thus it cannot cause `missing`.
- Rejected: return `missing` when only the own pipe name is missing. A name fault would then block each connect.
- Changed test expectations: `test_kanal_eines_anderen_terminals_blockiert_nicht` encoded the old behavior. It is replaced by `test_jedes_terminal_hat_einen_kanal_kein_falsches_missing`. The first attempt of the hung-terminal test now gets approx. 51 s, not 60 s.
- Cost: with a budget of 120 s, a hung terminal without a pipe is not restarted. The restart needs 64 s after the first attempt of 60 s.
- Cost: with less than 60 s left, a retry starts only if the own pipe is open. The symbol query (15 s) and the `unknown` state thus get 1 attempt, not 3. Before, each retry without a pipe took 60 s.
- Cost: the stream fetch holds `_MT5_LOCK` while it runs. While a symbol query or an Analyse query runs, the stream shows the bot metrics for that round.

## Verification

- `pytest tests` (worker_python): 850 passed.
- New tests were red before the fix: 5 failed in `test_mt5_connect.py`, 1 failed in `test_ws_stream.py`.
- The reviewer found a missing time buffer before the restart. The test with 2 s overhead failed with `_RESTART_BUFFER_SEC = 0` and passed with 5.
- Not verified: the GIL cause of deviation 3. The `MetaTrader5` library runs only on Windows.
- Manual check SYS-06 again on 2026-10-16, worker v0.7.228, VPS with 4 terminals, DEMO account A. A bot of account B ran on a different terminal.

| # | Before the fix | After the fix |
|---|---|---|
| 1 | `-10004` after 205 s | Clear message `'Python integration' kutusunu işaretleyin` after 14.0 s |
| 2 | Budget of 120 s exceeded by approx. 85 s | Budget kept (14 s) |
| 3 | No answer for approx. 3 min | 12 of 12 requests to `GET /api/system/worker/status` during the connect answered, max. 0.22 s |

- With Python integration on, `POST /api/start` connected in 1.7 s.
- Not done again: the cold start after a VPS reboot. It was not part of the 3 deviations. Fix #182 changed the attempt gate (`_attempt_fits`), which the cold start also uses; the unit tests cover it, the VPS did not.
- Deviation 3 did not occur again. The cause stays not verified, because the fix also shortened the connect.

## Open points

- [x] Run the manual check SYS-06 again on the VPS, DEMO account only (passed 2026-10-16).
- [ ] If the worker again does not answer during a connect, run the MT5 connect in a subprocess.

## Lessons

- On a VPS with more MT5 terminals, a check "any other pipe is open" is always true. Compare counts, not presence.
- Do not trust the `timeout` of `mt5.initialize()` when the pipe is missing. Plan with 60 s.
