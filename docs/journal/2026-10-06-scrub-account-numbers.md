---
date: 2026-10-06
type: fix
status: open
pr: [104]
features: [ACC-11, ENG-25, VPS-08, VPS-10]
areas: [docs, tests, worker, ops]
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
- In PR 104, `worker_python/run_ngrok_watchdog.bat` kept the real domain as the fallback when `NGROK_DOMAIN` is not set. A removal changes the runtime behavior on the VPS, so it got a separate PR (see "Follow-up: ngrok domain fallback").

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
- [x] Remove the real ngrok domain from `worker_python/run_ngrok_watchdog.bat` and from `test_vps_automation.py` (VPS-08). Separate PR.
- [ ] Owner, before the merge of the follow-up PR: make sure that `NGROK_DOMAIN` is set on the VPS. Run `reg query HKCU\Environment /v NGROK_DOMAIN` as the worker user. If the value is missing, run `setx NGROK_DOMAIN <domain>`. Without it, ngrok does not start after the next auto-update.
- [ ] Optional, separate PR: `.bat` files have LF line endings in the repository (`* text=auto`). cmd can fail to find a `goto` label at a 512-byte boundary in an LF file. The risk existed before. A change in `.gitattributes` (`*.bat text eol=crlf`) can make files dirty in existing checkouts and stop the auto-update, so examine it first.
- [ ] After the merge and the auto-update on the VPS: restart ngrok on the page `/vps`. Make sure that the tunnel comes back with the same URL (the bat file has no Windows test in CI).

## Follow-up: ngrok domain fallback

The bat file had the real domain as a fallback. The tunnel watchdog (VPS-10) read the same line as its own fallback. Now `NGROK_DOMAIN` is the only source.

| File | Change |
|---|---|
| `worker_python/run_ngrok_watchdog.bat` | No default domain. If `NGROK_DOMAIN` is not in the process, the script reads it from `HKCU\Environment` (`reg query`). If it is still missing, ngrok does not start: the script writes `NGROK_DOMAIN fehlt` to `logs\ngrok.log` one time and tries again every 60 s. |
| `worker_python/ops/windows/vps.ps1` | `restart-ngrok` with the watchdog window open but no ngrok process: the message says that the watchdog probably waits for `NGROK_DOMAIN`. |
| `worker_python/ops/windows/tunnel_watchdog.ps1` | `Get-NgrokDomain` reads only `NGROK_DOMAIN`; the bat fallback is removed. Without a domain, the check logs `no-domain` and does nothing (as before). |
| `worker_python/tests/unit/test_vps_automation.py` | VPS-08 and VPS-10 tests: no fixed domain, registry fallback, no start without a domain |
| `worker_python/start.bat`, `docs/windows_start_guide.md`, `docs/features/features.yaml` | Text: the domain comes from `NGROK_DOMAIN` |
| `hooks/RULES.md` §9.5.3 | The tracked files contain no real ngrok domain now |

Why no ngrok start without a domain: ngrok then gets a random URL. The stored worker address in the browsers and the tunnel watchdog use the fixed domain, so a random URL breaks the connection without a clear error. A waiting loop with a log line shows the cause on the page `/vps` (log tab "ngrok").

Why the registry read: `setx` changes only new processes. A bat window that started before the `setx` does not see the value. The tunnel watchdog has the same fallback in `Get-UserEnv`.

| Check | Result |
|---|---|
| `pytest tests/unit/test_vps_automation.py` | 47 passed |
| `scripts/features/run.sh unit VPS-08` / `VPS-10` | passed |
| `git grep` for the old domain (searched without output of the value) | nothing found |
| The bat file on Windows | not verified: CI and this session have no Windows. See the open point. |

## Lessons
- Use labels ("DEMO account A") and fake values from the start. A later cleanup does not remove the values from the git history.
- Keep the length of a replaced URL in layout tests. A shorter URL can hide an overflow at 375 px. The fake logins have 8 digits, one more than before; UI-08 stayed green.
