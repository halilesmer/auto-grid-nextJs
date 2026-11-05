---
date: 2026-11-05
author: Claude
type: fix
status: open
pr: []
features: [SYS-11, SYS-10]
areas: [tests, tooling]
---

# One heavy test run at a time on the Mac

## Request
More sessions run in their own worktrees on one Mac. Each session ran the full Playwright e2e suite and `next build` at the same time. Runs got slow, hit time-outs, and died with `Exit code 137`. Make heavy runs sequential across the machine, limit the local Playwright load, and remove orphan test servers.

## Cause

| Measurement (2026-11-05, UTC) | Value |
|---|---|
| Mac | 8 cores, 16 GB RAM |
| 16:43, four sessions with heavy runs | load average 69.7 / 52.3 / 52.1, swap 10.4 of 11.3 GB used |
| 16:37:34 | The Claude app restarted. Three background runs (precheck, full e2e) stopped with `Exit code 137`. The sessions did not get a notification. |
| S1 (PR 381), one lib test set | 21–28 s alone, 77–122 s with four sessions at the same time |
| Orphan `next start` | A killed run left its server on its port (3896). The next run on that port failed. |
| 17:48 | an orphan `next start -p 3100` of an old worktree (pre-SYS-10 port) still ran with parent pid 1 |

Earlier entries show the same symptom: `2026-11-01-unified-chart-page.md` (full run 27 min, FRM-30/UI-08/ZON-01 time-outs of 30 s under load) and `2026-10-30-oscillator-indicator-controls.md` (two time-outs that pass alone).

Root causes:

1. Each worktree has its own port (SYS-10), but CPU and memory are shared. Nothing stopped two full runs at the same time.
2. Playwright used half of the cores (4 workers) per run, so each run started 4 browsers and 4 renderers.
3. A run that stops with `kill -9` cannot clean up. Its `next start` stays on the port.
4. The Mac slept. It was on battery with the lid closed: sleep at approx. 16:53, only short DarkWake periods from 17:10 to 18:00, full wake at 18:12:38 (`pmset -g log`). A run that held the lock looked hung for 1.5 h, but `pytest` reported 717 s of its own time. At 18:15 the load average was 573 and swap was 11 GB. This was the wake transition: at 18:20 swap was 2 GB again. The port isolation and the lock do not solve sleep. Keep the Mac awake (power adapter, lid open) during long runs.

## Solution

| File | Change |
|---|---|
| `scripts/features/heavy_lock.sh` | New. Machine-wide lock: directory `/tmp/gridrobot-heavy.lock` (atomic `mkdir`) with `owner` = `<pid> <worktree> <HH:MM:SS>`, the same as the temporary `heavy-run.sh`. Wrapper (`heavy_lock.sh <cmd>`) or library (`source`). Stale lock: owner pid is dead (`kill -0`). Re-entry when an ancestor holds the lock. Release with `trap` on EXIT, HUP, INT, TERM; the exit code stays. Options: `HEAVY_LOCK=0`, `CI`, `HEAVY_LOCK_TIMEOUT` (exit 75), `HEAVY_LOCK_MAX_IDLE`, `HEAVY_LOCK_BREAK=1`, memory check (exit 76). |
| `scripts/features/e2e_server.sh` | New. Before the e2e step and on exit: stop a `next` server on the port of this checkout when its cwd (`lsof`) is this checkout and it has no running `playwright` ancestor. A foreign process gets an error message and is not stopped. `E2E_REUSE=1` keeps the server. |
| `scripts/features/precheck.sh` | Gets the lock for the full run, writes the current step to `<lock>/step`, cleans the own port. The last line shows the waiting time. |
| `scripts/features/run.sh` | Gets the lock for `all`, `e2e`, `live` without a filter or with a category filter. A single feature ID (`run.sh ENG-05`) and `unit`/`api` run without the lock. |
| `frontend_nextjs/playwright.config.ts` | Local workers: `E2E_WORKERS`, else 3. CI unchanged (Playwright default). |
| `frontend_nextjs/e2e/mocked/heavy-lock-lib.spec.ts` | New, `@SYS-11`, 11 tests on a temporary lock directory. |
| `hooks/RULES.md` §4.12–4.14, `CLAUDE.md` | Rules: heavy runs use the lock; briefs say that waiting is normal; the session limit does not make test runs sequential; examine the sessions after an app restart. |

Hang detection does not use the wall clock. The waiting run calculates a signature of the holder: CPU time of its process tree and its process list. Only waiting time without a change of the signature counts as idle. A clock jump between two polls (more than the poll interval + 60 s) means that the Mac slept, and resets the counter. After 10 min idle the waiting run writes a warning with the holder, its process, its last step and the command to stop it.

Memory check (macOS only): after the run gets the lock, it does not start when swap is at 90 % or more AND free memory (`kern.memorystatus_level`) is less than 20 %, and this stays so for 2 min (checks every 10 s).

## Why

- **Directory lock, not `flock`.** macOS has no `flock(1)` by default. `mkdir` is atomic on each file system. The temporary script of the sessions used the same directory and format, so the old and the new script see each other.
- **Lock the full precheck, not only the e2e step.** pytest (193 s) and lint also load the machine. One rule ("one heavy run") is easier to follow than a rule per step.
- **No wall-clock limit for the holder.** After the Mac slept, each holder looked hung. CPU progress of the process tree shows a real hang.
- **Memory check with two values.** At 18:18 swap was 97 % used, but free memory was 26–35 %: macOS keeps pages in swap until a process needs them. A check on swap only stops each run in this state. The 2-min window ignores the short peak after wake.
- **3 workers.** See the measurement below. Alone, 4 workers were not faster than 3. When a session runs a spec without the lock at the same time, fewer browsers leave more CPU.

## Verification

| Check | Result |
|---|---|
| Two fake heavy commands at the same time (temporary lock directory) | A 17:50:26–17:50:29, B waited ("Sperre hält: 47700 …"), then 17:50:30–17:50:31 |
| `kill -9` of the holder | lock stays; next run: `veraltete Sperre gelöscht (pid 49457 lebt nicht mehr …)`, then runs |
| Command fails (`exit 7`) | exit 7, lock removed |
| Lock of the temporary `heavy-run.sh` in `/tmp/gridrobot-heavy.lock` | new script waited and showed `Sperre hält: 46138 wonderful-morse-3c6ad9 16:45:34`, `HEAVY_LOCK_TIMEOUT=3` → exit 75 |
| Idle holder (`sleep`) / busy holder (`yes`) | warning and `HEAVY_LOCK_BREAK=1` for the idle holder; no warning for the busy holder |
| Waiting run stopped with `SIGSTOP` for 3 s (sleep simulation, `HEAVY_LOCK_SLEEP_GAP=1`) | `Uhrsprung 3s … Leerlaufzähler zurückgesetzt` |
| Orphan `next-server` on port 3460, cwd of this worktree | stopped; foreign `python3 -m http.server` on the same port: error, not stopped |
| `heavy-lock-lib.spec.ts`, `--repeat-each=3` | 33 passed |
| Playwright workers, 107 tests, own server, under the lock, alone | see table |
| `precheck.sh`, full run | see the PR; first run: 2831 tests in 7.1 min, 2 failures in the new spec (fixed: test holder was an ancestor; a second TERM during the EXIT trap left the lock) |

Workers (same 107 tests, `E2E_REUSE=1`, load average falling from approx. 90 after the wake):

| Workers | Time |
|---|---|
| 3 | 90 s (first run, load 20.6) |
| 2 | 121 s |
| 4 | 77 s |
| 3 | 77 s |

Not verified: the memory thresholds against a real out-of-memory state. The values come from the measurements above (four parallel sessions: free memory 26–35 %, swap 97 %), not from a crash.

## Open points
- [ ] Measure the full `precheck.sh` with 3 and 4 workers more than once, when the Mac is idle and awake.
- [ ] Check the memory threshold when the next `Exit code 137` occurs (`sysctl kern.memorystatus_level vm.swapusage`).

## Lessons
- A test that simulates "another holder" must not use its own pid: the test runner is an ancestor of the script.
- In a `trap … EXIT` handler, ignore signals first. Else a second signal stops bash before the cleanup.
- Before you call a run "hung", look at `pmset -g log`. Sleep looks like a hang.
