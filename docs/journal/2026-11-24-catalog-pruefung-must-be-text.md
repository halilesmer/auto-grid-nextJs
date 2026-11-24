---
date: 2026-11-24
author: Claude
type: fix
status: done
pr: []
features: []
areas: [tests, catalog]
---

# Catalog check rejects non-text `pruefung` steps

## Request
A `pruefung` step with `": "` in its text becomes a one-key dictionary in YAML. On 2026-11-23, five steps in FRM-05, FRM-18 and FRM-39 were broken this way. Other PRs fixed them, but `update_checklist.py --check` did not catch the error, so it could return.

## Solution
`validate()` in `scripts/features/update_checklist.py` now reports each `pruefung` item that is not a string, with the feature ID and step number. `run.sh check` and the `catalog` job in `tests.yml` call this function, so both fail with exit code 1. Test: `worker_python/tests/unit/test_katalog_pruefung.py`.

## Evidence
- Before the change, a catalog with `- Klicke: Speichern` gave `features.yaml ok` and exit code 0 (test red).
- After the change, the test passes and the real catalog has no finding.
