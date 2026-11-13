---
date: 2026-11-13
author: Claude
type: feature
status: done
pr: []
features: [ENG-35]
areas: [worker]
---

# Bot records the start and length of every turn

## Request

The browser backtest must match live trades closely. The remaining difference comes from the turn times of the live bot (the phase). Today the backtest estimates them from order history, and the estimate is wrong by 0.25–0.9 s after quiet periods. Source: project owner, 2026-11-13 (plan BKT-30, step PR-W).

## Solution

| File | Change |
|---|---|
| `src/utils/turn_log.py` | `TurnRecorder` (buffer, gzip append, 30-day prune) and `read_turns` |
| `src/core/loop.py` | Each loop pass records start (UTC ms) and length (ms, sleep not included) |
| `src/api/bot_control.py` | `GET /api/bot/{account_id}/turns?from=&to=` (read only, `account_access`, 2-day limit) |
| `src/utils/paths.py` | `get_turns_dir` → `data/turns/<account>/` |

- Row: `start_ms,dur_ms,kind,pre_ms`. Kinds: `t` full turn, `m` market closed, `c` connection unhealthy, `n` netting conflict. `pre_ms` is the time from the start of the pass to `manage_dynamic_grid` (only `t`).
- One file per UTC day (`turns_YYYYMMDD.csv.gz`). A background thread appends one gzip member (one write call) every 30 rows or 10 s. The stop route kills the bot process, so the last unwritten rows (at most 10 s while it trades) are lost. About 43,000 rows a day.
- A write error never stops the turn: only a list append happens inside the turn; the disk write runs in a daemon thread, so a slow disk cannot move the next turn. Errors are only counted. Nothing goes to stderr, because the bot process sends stderr to the account log.
- API answer: `t0` (first start), `dt` (start differences), `dur`, `kind`, `pre`.

## Why

- Non-`t` passes are recorded with a kind instead of skipped: the backtest needs to know that a gap is a closed market or a lost connection, not a missing record.
- Delta coding and gzip keep two days small. The file is gzip members so the bot process never rewrites a file.
- A reader can see the last member half written or damaged; it keeps the rows it could read and drops a line without a final newline.
- The first real records exist only after the VPS updates itself from `main`.
