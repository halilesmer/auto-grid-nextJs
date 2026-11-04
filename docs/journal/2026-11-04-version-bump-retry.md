---
date: 2026-11-04
author: Claude
type: fix
status: done
pr: [341]
features: []
areas: [tooling]
---

# Version bump workflow retries git fetch

## Request
Make `.github/workflows/version-bump.yml` robust against short GitHub SSH faults.

## Cause
After PR 340, the bump workflow failed in 3 runs (for example run 41816574834). `git fetch` returned `git@github.com: Permission denied (publickey)`. The deploy key was valid. In the same run, `actions/checkout` only worked on the third try. The step ran `git fetch` under `set -euo pipefail` with no retry. Only the push had a retry loop (3 tries). One SSH fault stopped the bump, and `main` kept the old version.

## Solution
| File | Change |
|---|---|
| `.github/workflows/version-bump.yml` | New `retry()` function. `git fetch` runs through `retry`: 5 tries, wait 5/10/20/40 s. The outer loop (fetch, reset, bump, commit, push) now has 5 tries instead of 3. |

The bump logic is the same: `VERSION` and `version.ts` rewrite, and the commit message `chore: auto bump version to vX.Y.Z [skip ci]`.

## Why
The outer loop already repeats the push after a fresh fetch. It covers both a rejected push and an SSH fault. A second `retry` around `git push` would repeat a rejected push with the same commit. That cannot work.

## Verification
- `bash -n` on the extracted step script: no error.
- Ruby YAML parse of the workflow: no error.
- `retry()` test with a stubbed command: success on try 3, and exit code 1 with an error after 5 failures.
- `actionlint` is not installed: not verified.

## Lessons
Wrap each network call of a CI step in a retry when the call is safe to repeat. A valid key does not prevent short GitHub SSH faults.
