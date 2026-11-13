---
date: 2026-11-13
author: Claude
type: fix
status: done
pr: []
features: [SYS-10, SYS-11]
areas: [tests]
---

# precheck.sh now checks Python packages before the lock

## Request
A precheck run in a new worktree wasted 36 minutes. `worker_python/.venv` was missing, and `precheck.sh` fell back to the system `python3` without a message. The run waited 18 minutes for the heavy lock. The catalog step (`import yaml`) and the worker step (`No module named pytest`) failed in 0 seconds, but the e2e step still ran for 18 minutes.

## Cause
`precheck.sh` chose the Python and did not test it. The failure was visible only after the lock wait.

## Solution
| File | Change |
|---|---|
| `scripts/features/precheck.sh` | Before `heavy_lock_acquire`, run `"$PY" -c 'import yaml, pytest'`. On failure: exit 1 with a German message that names the Python and two fixes (symlink the main checkout venv, or `pip install -r requirements-dev.txt`). |
| `frontend_nextjs/e2e/mocked/test-scripts-lib.spec.ts` | New SYS-10 test: a Python without the packages, a held lock. The script must exit 1 in under 20 s, print the message, and not start a step. |
| `docs/features/features.yaml`, `hooks/RULES.md` | SYS-10 text and §4 rule 12a updated. |

## Why
Only `yaml` (`update_checklist.py`) and `pytest` (worker tests) are needed. `pw_stats.py` uses the standard library only. The fallback to `python3` stays: CI does not run `precheck.sh` (it installs the packages with `pip` in its own steps), and a system Python that has the packages must keep working. The check stops the run only when a package is really missing.

## Verification
The new test failed first (it waited 65 s for the lock), then passed with the check. See the PR for the full `precheck.sh` result.

## Lessons
Test a tool choice before a long wait. A silent fallback hides the cause until the end.
