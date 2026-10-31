---
date: 2026-10-31
author: Claude
type: fix
status: open
pr: [262]
features: [UPD-07, UPD-02]
areas: [worker]
---

# Time limit for all git calls of the updater

## Request

PR #260 left one open point: `subprocess.run` in `self_updater.py` has no timeout. A hung `git fetch` stops `tick()` for all time without a log line. The task: give each `git` call a time limit. A timeout must give a return value with an error text, not an exception. `execute_git_pull` must restore the state from before the pull.

## Cause

No git call in `self_updater.py` had a time limit. `run_auto_updater` waits for `tick()`, so one hung call stops all later runs. Only an old `checked_at` in `GET /api/system/worker/status` shows it. This defect did not cause the failure of 2026-10-31 (`2026-10-31-auto-update-stale-window-env.md`).

## Solution

| File | Change |
|---|---|
| `worker_python/src/utils/self_updater.py` | All git calls go through `_git`, which has a limit: 120 s for `fetch` and `pull`, 60 s for local commands. At the limit it kills the process tree and raises `GitTimeout`. `check_for_updates`, `ensure_git_repo` and `execute_git_pull` change this into a return value. |
| `worker_python/src/utils/self_updater.py` | The rollback goes to `old_head`, not `HEAD`. After a timeout it removes `.git/index.lock`. If the rollback fails, the error text says so. |
| `worker_python/src/utils/auto_updater.py` | No logic change. `tick()` records `check_failed` or `pull_failed`. A timeout in `current_branch` or `_is_behind_origin` goes to the `except` of the loop, which records `check_failed`. |
| `worker_python/tests/unit/test_self_updater_timeout.py` | 13 tests with a real hung process tree. |

Measurement for the limit (2026-10-31, Mac to GitHub): `git fetch` without changes 0.6 s, a clone of the full history (5.6 MB) 1.5 s. The limit of 120 s is 80 times the full history. It gives a margin for a slow VPS network and for antivirus during checkout, and it stays below the interval of 5 minutes. The local limit of 60 s has no measurement on the VPS. The `reset --hard` of a new repository in `ensure_git_repo` writes all files, so it has the limit of 120 s.

## Why

- `subprocess.run(timeout=...)` was rejected. On Windows it calls `communicate()` without a limit after the kill. `git-remote-https` inherits the pipes and lives on after `git` dies, so the call hangs at the same place. The CPython source of `subprocess.run` shows this path. Thus `_git` uses `Popen`, kills the tree with `psutil`, and has a limit of 5 s for the second `communicate()`.
- `GitTimeout` is a separate exception. The text of `TimeoutExpired` has the full command, and `git remote set-url` has the token from `github_token.txt` as argument. That text would go to the log and to the status route. `GitTimeout` has only the subcommand, and `from None` removes the cause for the same reason.
- `_rollback_failed_pull` does not apply the stash if `reset` or `clean` failed. The tree is then half restored, and a pop would mix the two states. The error text names the stash. The old code applied the stash in all cases.
- `_git` raises and does not return a failed result. A failed result in `current_branch` would read as `other_branch`, and in `_is_behind_origin` as `local_commits`. Both give a false reason.
- A killed git cannot remove `index.lock`. Without the removal, each later reset and pull fails until a person acts. The removal runs only after a timeout in `execute_git_pull`, not in `check_for_updates`, because a `fetch` of the check must not remove the lock of a pull that runs at the same time.
- Deliberate exception to "restore the state": if `stash pop` times out, the code does not reset. The pop can be complete, then the stash is gone and a reset would delete the local changes for all time. The pull stays, the error text tells it, and the worker does not restart. Local changes have priority over the old state.

## Verification

- 10 tests were red on the old code (`assert True is False`): the fake git hung for 8 s and then gave success. The eleventh test (`index.lock` cannot be removed) came with its `OSError` branch. Its red state was not seen.
- Mutation checks, each one made the tests red: kill only `git` and not the tree; rollback to `HEAD`; no removal of `index.lock`; no reset guard for `stash pop`. The last mutation did not show at first, because the test hung at the start of the pop. The test now hangs after the pop.
- The first full run had 2 red tests, and a different 2 in the second run. The cause was the test limit of 0.5 s: under load a normal `git rev-parse` was slower. The test limit is now 3 s.
- The `reviewer` agent found 4 defects to fix: the limit for the first checkout, a stash that stays after a killed `stash push` (red before the fix), a rollback error that does not name the stash (red before the fix), and an `OSError` from `psutil`. Two more findings are in the open points.
- The Codex scan found 2 points. Accepted: a timeout of `git show` gave success with the version "Bilinmiyor" (test red before the fix). Rejected: a stale ref lock such as `refs/heads/main.lock`. git holds this lock for milliseconds, and it is not a place where a network hang occurs. A try with such a lock: `git reset --hard` exits with 1, the working tree is restored, and the error text names the lock. A removal of all ref locks could remove the lock of another git. See the open points.
- `pytest tests` → 948 passed.
- `pyright` on `self_updater.py` and `auto_updater.py` → 0 errors.
- Not verified: the kill on Windows. The hung process in the tests is an `sh` script, so the path of `communicate()` on Windows and `psutil` with `git-remote-https` did not run. CI runs on Linux, and the worker does not run on the Mac.

## Open points

- [ ] If `stash pop` or the `diff` after it times out with local changes, the pull stays. There is no pip and no restart, and the next run gives `up_to_date`. Nothing tries again: the worker keeps the old code in memory, and a change to `requirements.txt` from this pull is not installed. This needs local changes on the VPS and a hung local git. Check `auto_update` after such an error and restart by hand.
- [ ] If the root `git` has ended and only a helper holds the pipes at the limit, `children()` raises `NoSuchProcess`, and the helper stays. The limit still holds: `GitTimeout` comes after 5 s more.
- [ ] A stale ref lock after a kill stays. The reset then gives `Geri alma tamamlanamadı` with the lock name, and later pulls fail until a person removes the file.
- [ ] `_pip_install` in `self_updater.py` has no time limit. A hung `pip install` stops `tick()` in the same way. It was outside this task.
- [ ] `/system/update`, the auto-updater and the task `AutoGrid-Update` have no common lock. A second pull can run at the same time. The removal of `index.lock` makes this race a little worse. The timeout must occur at the same time, so the risk is small.
- [ ] A check that hangs at a credential prompt now fails after 120 s each run. `GIT_TERMINAL_PROMPT=0` would fail at once. There is no evidence that this occurs on the VPS.
- [ ] UPD-07 manual check on the VPS: block GitHub for one run, or wait for a real timeout. Expected: `auto_update.result` is `check_failed`, and `checked_at` stays new.

## Lessons

- Do not trust `subprocess.run(timeout=...)` for a command with child processes that inherit its pipes.
- Exception text of `subprocess` has the full command. Do not put it in a log or a response if an argument can have a secret.
- After a kill, look for what the process could not clean up: lock files, a moved `HEAD`, a half-done stash.
- A test limit near the normal run time gives a flaky test. Find the cause before a rerun.
