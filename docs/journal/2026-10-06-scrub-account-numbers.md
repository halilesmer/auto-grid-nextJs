---
date: 2026-10-06
type: fix
status: open
pr: []
features: [ACC-11, ENG-25]
areas: [docs, tests, worker]
---

# Remove MT5 account numbers from tracked files

## Request
The repository is public. Tracked files contained real MT5 logins and the real ngrok domain of the VPS (open point of `2026-10-06-rules-journal-model-usage.md`). Replace them with neutral placeholders. Do not rewrite the git history.

## Cause
Code comments, test docstrings, e2e mocks, feature notes and guides used the real values as examples. Most of these files are older than the privacy rule in `hooks/RULES.md`.

## Solution

| File | Change |
|---|---|
| `worker_python/src/core/grid_execution/vanished.py`, `src/utils/mt5_terminal_guard.py`, `src/utils/paths.py` | Comments and examples use `<account_id>` or "account B" |
| `worker_python/tests/unit/test_mt5_terminal_guard.py` | Fake logins: account A = `OTHER_LOGIN` 2002, account B = `LOGIN` 1001 |
| `worker_python/tests/unit/test_eng_vanished_orders.py` | Docstring without the login |
| `frontend_nextjs/e2e/mocked/vps.spec.ts`, `tooltips.spec.ts`, `mobile-layout.spec.ts` | Fake logins `12345678` / `87654321`; ngrok URL `example-tunnel-subdomain.ngrok-free.dev` with the same length, so that the 375 px layout test (UI-08) stays valid |
| `docs/features/features.yaml` | ACC-11 and ENG-25 descriptions without logins |
| `docs/features/manual_results.yaml` | 12 notes with labels; routes written as `{id}`, because `<id>` shows as an HTML tag on GitHub |
| `docs/features/FEATURES.md`, `results.json` | Generated again with `scripts/features/run.sh` |
| `docs/analyse-regeln.md` | "DEMO-Konto A @ Demo-Server" |
| `docs/windows_start_guide.md`, `docs/NGrok/Sistem ve Canlıya Alma.md` | `<NGROK_DOMAIN>` |
| `hooks/RULES.md` §9.5.3 | The packet grep stays, but the sentence no longer says that tracked files contain account numbers |

Labels for the accounts (use the same labels in all entries):

| Label | Account |
|---|---|
| DEMO account A | The test account in `hooks/test-account.local.md` |
| DEMO account B | The second DEMO account of the 2026-09-29 incidents (`2026-09-29-order-flood-external-client.md`) |
| DEMO account C | The account of the fractal case in `2026-10-02-fractal-bid-touch.md` (its login was in the examples of `paths.py`) |

## Why
- This PR does not rewrite the git history. A force push breaks all clones and open branches, and the old values stay in forks and caches. The owner decides about a rewrite (open point).
- The broker server-name format example stays in `account.ts`, `hints.ts`, `mt5_errors.py` and `test_mt5_connect.py` (owner decision). It shows the format of a server name, not a private server.
- `worker_python/run_ngrok_watchdog.bat` keeps the real domain as the fallback when `NGROK_DOMAIN` is not set. `test_vps_automation.py` (VPS-08) pins this fallback. A removal changes the runtime behavior on the VPS, so it gets a separate PR.

## Verification

| Check | Result |
|---|---|
| `pytest tests/unit/test_eng_vanished_orders.py tests/unit/test_mt5_terminal_guard.py` | 18 passed |
| `scripts/features/run.sh unit ACC-11` / `ENG-25` | 14 passed / 4 passed |
| Playwright mocked, `--grep "@VPS-\|@UI-07\|@UI-08\|@ANA-01"` | 44 passed |
| `scripts/features/run.sh check` | ok (140 features) |
| `git grep` for the old logins | nothing found |
| `git grep -nE '\b[0-9]{7,8}\b'` | no real login; only placeholders (`12345678`, `87654321`), `1.00000001`, `package-lock.json` versions and the GitHub bot e-mail ID |

## Open points
- [ ] Owner: decide if the git history gets a rewrite. Old commits keep the values. Do not force push without this decision.
- [ ] Remove the real ngrok domain from `worker_python/run_ngrok_watchdog.bat` and from `test_vps_automation.py` (VPS-08). First make sure that `NGROK_DOMAIN` is set on the VPS (`setx`). Separate PR.

## Lessons
- Use labels ("DEMO account A") and fake values from the start. A later cleanup does not remove the values from the git history.
- Keep the length of a replaced URL in layout tests. A shorter URL can hide an overflow at 375 px. The fake logins have 8 digits, one more than before; UI-08 stayed green.
