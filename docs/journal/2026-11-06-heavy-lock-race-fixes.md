---
date: 2026-11-06
author: Claude
type: fix
status: open
pr: [398]
features: [SYS-11, SYS-10]
areas: [tests, tooling]
---

# Heavy lock: race and wrong-process fixes

## Request
The Opus audit (R3) of `scripts/features/` found races and wrong decisions in the heavy lock (PR 389) and in the other test scripts (PR 384). The project owner approved the fixes before the work started. This entry covers the lock (R3-03, R3-04, R3-10). Part 2 (R3-06 to R3-09, R3-11) is a second PR.

## Cause
| ID | Symptom | Cause |
|---|---|---|
| R3-03 | Two runs hold the lock at the same time | Waiter W2 compared `owner`, then W1 deleted the dead lock and took a new one, then W2 ran `rm -rf` on the new lock. `heavy_lock_release` also removed the directory when `owner` was empty. |
| R3-04 | A waiter waits for ever, or `HEAVY_LOCK_BREAK=1` stops an unrelated process tree | The pid in `owner` was never checked against the process. After `kill -9`, the pid can belong to another process. |
| R3-10 | A live lock is deleted | `kill -0` fails for "no such process" and for "operation not permitted". Both counted as dead. Reproduced with owner pid 1. |

Reproduction before the fix (own temporary lock directory, 15 parallel wrappers behind a dead lock, critical section checked with `mkdir`): 4 of 6 rounds had a violation. With owner pid 1, the lock was deleted. With a live `sleep` as owner (wrong start time), `BREAK=1 MAX_IDLE=2` stopped the `sleep`.

## Solution
| File | Change |
|---|---|
| `scripts/features/heavy_lock.sh` | `_hl_remove`: every delete takes the mutex `<lock>.break`, reads `owner` again inside it, and deletes only if it still matches (an empty owner needs a minimum age). A mutex that is older than 30 s is taken over. |
| | `heavy_lock_release`: removes the directory only when `owner` starts with its own pid. If `owner` is empty, a local flag decides (empty before the write = ours; empty after the write = not ours any more). |
| | Fourth `owner` field `ls=<ps lstart, spaces as _>`. `_hl_owner_alive` compares it. A legacy `owner` without it is judged by the pid only. `_hl_break` checks it again right before `kill`. |
| | `_hl_pid_alive`: "operation not permitted" and a `ps -p` hit count as alive. |
| | A numeric owner pid of 0 or 1 counts as a foreign holder (a process tree from pid 1 is the whole machine). |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | 7 new tests (SYS-11) |
| `docs/features/features.yaml`, `hooks/RULES.md` §4.12 | New owner format and delete rule |

## Why
- Second mutex instead of `flock`: `flock` does not exist on macOS. `mkdir` is atomic on both systems.
- The fourth field, not a new separator: other worktrees still run the old script. It reads the first three fields only.
- Not solved: a legacy `owner` (no `ls=`) with a reused pid. `BREAK=1` can still stop that process after `MAX_IDLE`. A check against the age of the `owner` file would fix it, but it can wrongly delete a live lock of the old `heavy-run.sh`. The wrong delete costs more, so it is not in this change.
- Not solved: if a process dies between `mkdir <lock>.break` and `rmdir`, two waiters that take over the stale mutex at the same moment can both enter. It needs a crash and a 30 s wait first.

## Verification
- Before the fix (old script, same tests): R3-03, R3-04 (2 tests) and R3-10 (2 tests) red; the legacy-format and matching-start-time tests passed.
- After the fix: `heavy-lock-lib.spec.ts` 20 of 20 passed on macOS with bash 3.2. The stress loop (15 wrappers, dead lock) ran 12 rounds: 0 violations, the stale message exactly once per round (before: 11 messages instead of 5 in the audit run).
- Not verified: Linux CI before the PR checks run (`ps -o lstart`, GNU `stat` path); the real EPERM case as a sandboxed process (only a root-owned process as a normal user).

## Open points
- [ ] Part 2 of the R3 fixes: R3-06, R3-07, R3-08, R3-09, R3-11 (scripts `e2e_server.sh`, `precheck.sh`, `run.sh`, `e2e/fixtures/env.ts`).

## Lessons
- Compare-then-delete on a shared directory needs a mutex around both steps. A re-read is not enough.
- `kill -0` returns the same code for ESRCH and EPERM. Read the message, or ask `ps -p`.
- An owner file that stores a pid also needs the process start time.
