---
date: 2026-11-24
author: Claude
type: diagnosis
status: done
pr: []
features: [USR-14, UI-22, ANA-27]
areas: [tests]
---

# Three red e2e results were old

## Request
`FEATURES.md` showed e2e ❌ (2026-11-15) for USR-14 (10 tests), UI-22 (55) and ANA-27 (9). Flaky fixes for ANA-27 merged after that date (PR 586–599), but nobody wrote the results again.

## Solution
Each feature ran alone with `scripts/features/run.sh e2e <ID>` on 2026-11-24, at the head of `main` (v0.7.703).

| Feature | Result |
|---|---|
| USR-14 | 12 passed |
| UI-22 | 55 passed |
| ANA-27 | 13 passed |

- No code and no test changed. The ❌ marks were old results, not open defects. No known error (`bekannter_fehler`) is needed.
- The run shares spec files with USR-12 and UI-23. Their results were written again too (both passed).
- Each feature ran once. The flaky rate is not measured; the test counts are the current ones (USR-14 12, ANA-27 13).
