---
date: 2026-11-07
author: Claude
type: decision
status: done
pr: []
features: [ANA-04]
areas: [worker]
---

# Market database size limit raised to 10 GB

## Request
The project owner wants one year of history on the chart. One year of M1 data needs about 33 MB for each symbol. The default limit of 5000 MB is too low for this plan.

## Solution
| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | `MAX_MB_DEFAULT` is now 10000. `MARKET_DB_MAX_MB` still overrides it. |
| `docs/windows_start_guide.md`, `docs/features/features.yaml` | The default value is 10000. |
| `worker_python/tests/api/test_market_db_api.py` | A test checks the default without the environment variable. |

## Why
The database was about 213 MB on 2026-11-07, so the new limit does not use disk space by itself.

## Risk
`BACKUP_KEEP = 7`. The worker backs up the database each day and keeps the last 7 backups. A database of 10 GB plus 7 backups can use up to 80 GB of disk space. The free disk space on the VPS is not known. The decision to reduce `BACKUP_KEEP` is open and belongs to the project owner. This change does not touch the backup logic.
