---
date: 2026-11-06
author: Claude
type: fix
status: done
pr: []
features: [SYS-11]
areas: [tests, tooling]
---

# Heavy lock: waiters get the lock in order

## Request
Waiters of `scripts/features/heavy_lock.sh` must get the lock in the order they arrived (FIFO).

## Cause
Every waiter polled `mkdir` on its own (every 5 s). Whoever polled first after a release took the lock. On 2026-11-06 a 2-spec rerun waited more than 30 min and lost the race three times to full prechecks (15 to 25 min each) that arrived after it.

## Solution
| File | Change |
|---|---|
| `scripts/features/heavy_lock.sh` | Each waiter writes a ticket `<lock>.queue/<arrival time in µs>-<pid>` (same format as `owner`, with `ls=`). It tries `mkdir` only when its ticket is the oldest live ticket. |
| | A dead ticket (pid not alive, or `ls=` differs) is deleted by any waiter that sees it, so a dead ticket at the front blocks nobody. |
| | The ticket is deleted when the lock is taken, on timeout (75), on re-entry, and on exit, error and INT/TERM/HUP (the traps now exist before the wait starts). |
| | The wait message now says the place in the queue ("sitze an 2. Stelle"). |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | 3 new tests: A, B, C order; a waiter killed with `kill -9` at the front; a legacy waiter without ticket. |
| `docs/features/features.yaml`, `hooks/RULES.md` §4.12 | SYS-11 text |

## Why
- Tickets in a directory, not a counter file: `mkdir`/`mv` are atomic on macOS and Linux, and there is no `flock` on macOS.
- The ticket is written to a temporary file and then moved, so a reader never sees an empty ticket.
- A dead ticket is deleted with a plain `rm -f`, without the `.break` mutex. A dead process never becomes alive again and nobody rewrites a ticket, so there is nothing to compare first. The mutex stays for the lock directory.
- `owner` and the lock directory did not change. Old scripts (other worktrees, older main) do not know tickets and keep polling `mkdir` themselves. Accepted: an old waiter can skip the queue. It cannot cause a deadlock: a free lock is taken by whoever sees it first, and a waiter with a ticket tries again at each poll.
- Arrival time uses `perl` (µs). Without `perl` it falls back to whole seconds, and then the pid decides inside one second.

## Verification
- `heavy-lock-lib.spec.ts`, 24 of 24 passed (21 old + 3 new), run with a temporary config without web server.
- The 3 new tests fail with the old script (red), and pass with the new one.

## Open points
- [ ] Old copies of the script in other worktrees keep the old order until they update from `main`.

## Lessons
- A shared lock that many sessions poll needs an order, not only mutual exclusion. A "first to poll wins" rule starves a short job behind long ones.
