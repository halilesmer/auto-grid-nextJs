---
date: 2026-11-07
author: Claude
type: feature
status: open
pr: [434]
features: [BKT-05, ACC-05, ANA-07, USR-04, ANA-04]
areas: [worker, frontend, tests, docs]
---

# CSV imports belong to the MT5 server

Step SW of plan 1107-A4 (`2026-11-07-chart-history-plan.md`).

## Request
The project owner decided on 2026-11-07: imported data must never be deleted again. Accounts on the same server use the same data. Example: the user imports one year of M1. Three months later the user imports a new file of one year. Only the last three months are new. The chart and the backtest read 15 months as one series.

## Solution

| File | Change |
|---|---|
| `worker_python/src/utils/market_db.py` | Migration 10: column `csv_imports.server` and index `csv_imports_server`. `_csv_imports_add_server` fills the server from `configs/accounts.json`. `delete_account` is removed. New `read_rates_union` and `rate_coverage_union`. |
| `worker_python/src/utils/csv_import.py` | `commit` never deletes an import. The commit flag `replace` is now `extend` (confirmation only). `get_rates` reads the series. `list_imports` returns files and series. `delete` needs the admin for a finished import. |
| `worker_python/src/api/market.py` | The endpoints build a `Viewer` (account, server of the account, role). A server mismatch gives 404. |
| `worker_python/src/api/accounts.py` | An account delete removes only the account record. The favorites file stays. A delete notes the owner. A create or a rename to an old id calls `claim_account`. |
| `frontend_nextjs/src/components/backtest/CsvImportPanel.tsx` | One row per series. The files list opens on request. A confirm dialog for the delete. No delete button for users. |
| `frontend_nextjs/src/components/backtest/CsvImportDialog.tsx` | The overlap warning is an info message. The button is "Extend and import". |
| `frontend_nextjs/src/components/backtest/RunSettings.tsx`, `BacktestView.tsx` | The data source list has one option per series. A saved file id of any file in the series stays valid. |
| `frontend_nextjs/e2e/fixtures/mock-worker.ts` | The mock follows the new worker behavior (server, series, extend, admin delete). |

### Rules in the worker
- A series is the set of finished imports with the same server, symbol and timeframe.
- Priority: the import with the oldest `committed_at` (the time of the end of the commit) wins a minute. A tie goes to the smaller `import_id`.
- `missing` is the gap list of the joined coverage.
- A finished import is visible when its server equals the server of the account. An import with `server IS NULL` is visible to the admin only. A staging upload is visible to the uploading account only.
- `DELETE`: a finished import needs the admin (403 for a user). The uploading account can cancel its own unfinished upload.
- The list response has `series`. `bars` counts each minute once. `import_ids` lists all files of the series.

## Why
- **Key = server, not account.** The MT5 candles already use the server as the key. CSV imports now follow the same rule. A demo server and a live server stay apart. Their price feed, spread and history depth can differ.
- **`extend` instead of `replace`.** The warning still needs a confirmation. The worker never deletes an old file. The alternative was to merge the files into one on commit. The project rejected it: a delete of one file would then leave a hole in the series.
- **Overlap is stored twice.** Each import keeps all of its own candles. Nine months of overlap on one symbol costs about 25 MB. In return, a delete of one file never leaves a hole.
- **A delete of an account keeps the data.** The data belongs to the server, to the user and to the account id. The same id gets everything back.
- **The admin sees imports with `NULL` server.** The server of an import whose account no longer exists is not known. It is not safe to show it to other users.
- **The migration uses `accounts.json`.** It runs once on the live database. It is idempotent: it adds the column only if the column is missing and it fills only rows with `server IS NULL`. It deletes no row. If `accounts.json` exists but is not readable, the migration stops and rolls back (503). The next start tries again. A missing file counts as no accounts. The automatic backup before each migration (`pre-v10`) is the same as before.

## Risks
- **One disk (1107-A5.3).** All imported data lives on the disk of the one VPS. The daily backups (`BACKUP_KEEP` = 7) are on the same disk. A disk failure loses data and backups. The size of the database now only grows: no delete cleans up. The limit of `MARKET_DB_MAX_MB` stops new candles only.
- **Archive and a reused account id.** The deal archive hangs on the account id. After a delete, a new account with the same id could read the old archive. The security review found this. The worker now stores the old owner in `deleted_accounts`. A create, or a rename to that id, calls `claim_account`. A different owner gets an empty archive (deals, account information, SL/TP lookups, zone register). The same owner gets the archive back. An admin who creates the account without an owner also discards the archive of a user. The delete and the create fail closed: if the database does not answer, the call fails. A rename notes the old id for the old owner. Tests: `test_anderer_besitzer_erbt_das_deal_archiv_einer_geloeschten_kennung_nicht` and `test_umbenennen_auf_eine_verwaiste_kennung_erbt_das_archiv_nicht`.
- **Unfinished uploads and favorites** hang on the account id too. A new owner of a reused id can see an unfinished upload for up to 24 hours. The new owner also gets the favorites file. The impact is low. `claim_account` does not remove them.
- **Disk quota.** Each user of a server can store full duplicates with `extend` (150 MB per file). Only the admin deletes them. There is no quota. A full database also stops new MT5 candles.
- **Access.** Users on the same server share the imports. A user can add overlapping files for all of them. Only the admin removes a file.

## Verification
- `worker_python/tests/api/test_csv_import_api.py`: overlap keeps the old import, old import wins a minute, delete of the old file keeps the minutes of the new file, same server shares, other server gets 404, user cannot delete, series list.
- `worker_python/tests/api/test_accounts_api.py`: an account delete keeps archive, report, import and favorites, and a new account with the same id gets them back.
- `worker_python/tests/api/test_market_db_api.py`: the migration writes the server and gives `NULL` to an import without an account. A second run changes no row and loses no row.
- `frontend_nextjs/e2e/mocked/csv-import.spec.ts` (`@BKT-05`): series list, extend warning, delete confirm, no delete button for a user.
- The worker does not run on the Mac. The migration did not run on the live database yet.

## Open points
- [ ] After the merge and the pull on the VPS: `GET /api/market/<account>/imports` lists the three existing imports with their server.
- [ ] After the merge: `GET /rates?source=csv:<USOUSD id>` returns 1 380 candles for 2025-11-10.
- [ ] Decide on an off-site copy of `market.sqlite` (1107-A5.3).
