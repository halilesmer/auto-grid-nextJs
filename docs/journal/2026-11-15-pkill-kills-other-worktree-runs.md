---
date: 2026-11-15
author: Claude
type: fix
status: done
pr: []
features: [SYS-16, SYS-11]
areas: [tooling]
---

# A session killed the heavy runs of other worktrees

## Request
Several Claude sessions run in separate worktrees on one Mac. Heavy runs (`precheck.sh`, full e2e, `next build`) share one lock (SYS-11). Runs were killed that did not belong to the session that killed them. Stop this.

## Cause
Sessions stopped their own run with `pkill -f` and a pattern that every worktree shares. The pattern matches the processes of all worktrees.

Evidence from the session transcripts (UTC):

| Time | Command | Effect |
|---|---|---|
| 2026-11-14 23:49:19 | `pkill -f "scripts/features/precheck.sh"` | Runs of other worktrees stopped. |
| 2026-11-15 00:38:46 | `pkill -f "scripts/features/precheck.sh"; pkill -f "playwright"; pkill -f "next start"; pkill -f "next build"` | In 3 s, 4 runs of 4 other sessions stopped. One run held the lock in the middle of the e2e step (`Terminated: 15`). Two runs had waited 48+ min in the queue (exit code 144). |

All runs were started again at once. Hours of work were lost. The sessions that lost a run did not know the reason. One of them blamed an app restart. The same pattern is in the transcripts of 11-12 and 11-13.

## Solution
| File | Change |
|---|---|
| `hooks/claude/pre-bash-kill.sh` | New PreToolUse hook. It stops `pkill`, `killall`, and `pgrep` with `kill` when the pattern does not contain the path of this checkout. It checks each part of a command chain and `bash -c` strings. `run_in_background` does not lift the block. |
| `.claude/settings.json` | Registers the hook for `Bash` as the second hook. |
| `scripts/features/precheck.sh` | `--stop` stops only the run of this checkout. The run writes `.feature-results/precheck.pid` (PID and checkout path). `--stop` ends the run and its child processes only if the file names this checkout and the command is `precheck.sh`. The signal handler of the run then releases the lock and removes the test server. |
| `hooks/RULES.md` §4.16, `hooks/README.md`, `docs/features/features.yaml` | Rule, hook table, catalog entry SYS-16. |
| `e2e/mocked/kill-hook-lib.spec.ts` | Tests: the 2 real commands and 9 more forms are blocked; own-path patterns, `kill <pid>`, `echo pkill`, and `grep pkill` pass. Tests for `--stop`: stops its own run with its child, stops no foreign process, does nothing without a PID file. |

## Why
A shared pattern has no owner. The hook makes the owner part of the pattern: the path of the checkout. This is the same idea as the orphan-server cleanup in `e2e_server.sh`, which only ends a process whose working directory is the own checkout. `--stop` gives a session a safe way to do what it wanted.

## Verification
- Before the hook existed, the hook tests failed (red). With the hook and `--stop`, the test file passes (40 tests with the SYS-14 tests).

## Open points
- The hook protects only the Bash tool of Claude. A `pkill` that the owner types in a terminal is not checked.
- A pattern that a variable builds (`pkill -f "$X"`) is blocked, because the hook cannot see its value. The message says this.

## Lessons
A kill command needs a scope. When a run must stop, use its task ID, its PID file, or a pattern with the own checkout path.
