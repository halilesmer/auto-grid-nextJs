# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Grid Robot: an algorithmic grid-trading bot for MetaTrader 5. Monorepo with two packages:

- `frontend_nextjs/` – Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, lightweight-charts
- `worker_python/` – FastAPI worker that talks to MT5 (the `MetaTrader5` package is Windows-only; the worker is meant to run on a Windows host/VPS, often exposed via ngrok)

`docs/proje_dosya_krokisi.md` (Turkish) is the maintained architecture map — read it first before larger changes. Parts are stale (e.g. it mentions `grid_position_sync.py`, which no longer exists), so verify against the code.

`frontend_nextjs/AGENTS.md` (loaded via `frontend_nextjs/CLAUDE.md`) applies to all frontend work: this Next.js version has breaking changes — consult `frontend_nextjs/node_modules/next/dist/docs/` before writing Next.js code.

## Dev setup

Development happens on a MacBook, split across two machines:

- **Mac (local):** the frontend only. Run `npm run dev:frontend` and test at http://localhost:3000. `frontend_nextjs/.env.local` points `NEXT_PUBLIC_API_URL` at the worker's ngrok URL.
- **Windows VPS:** the worker only, started with `worker_python/start.bat` (uvicorn crash watchdog via `run_uvicorn_watchdog.bat`, ngrok crash watchdog via `run_ngrok_watchdog.bat`). See `docs/windows_start_guide.md`. A fresh VPS is set up with one command in an admin PowerShell, `irm .../ops/windows/bootstrap.ps1 | iex` (installs Git/Python 3.11/the VC++ redistributable if missing, clones the repo, sets up the venv + `requirements.txt`, generates `WORKER_API_KEY`, configures ngrok, then calls `setup_vps.ps1` and starts the worker, ending with a connection link for the web UI, `ops/windows/connect-link.ps1`); repo clone/venv/pip/ngrok run in their own scheduled task with `RunLevel Limited` (`bootstrap-user.ps1`), never elevated. After that (or the one-time `worker_python/ops/windows/setup_vps.ps1` on its own, admin: `-PublicKey` optional — auto-login, scheduled tasks `AutoGrid-Start`/`AutoGrid-Update` with RunLevel Limited, and with `-PublicKey` also OpenSSH key-only), the VPS can also be controlled from the Mac via the page `/vps`: the Next.js route `src/app/api/vps/[action]/route.ts` runs `ops/windows/vps.ps1` over SSH (`src/lib/server/vpsSsh.ts`, server-only env `VPS_SSH_HOST`/`VPS_SSH_KEY`/`VPS_REPO_PATH`, localhost only). Under the watchdog the worker auto-updates from `origin/main` (`src/utils/auto_updater.py`, `AUTO_UPDATE_MINUTES`, default 5) and resumes bots that were running before a restart (`data/watched_bots.json`). Self-healing without remote access: the scheduled task `AutoGrid-Tunnel` (`ops/windows/tunnel_watchdog.ps1`, every 5 min, VPS-10) checks that the public ngrok URL answers `/api/system/platform`, restarts ngrok (or worker + ngrok via `AutoGrid-Start`) and reboots the VPS after 3 failures in a row (at most once an hour, 3 times a day); it runs elevated only for the reboot and never runs git or starts worker/ngrok itself. Rights rule: never run `git` on the VPS as administrator (files would become admin-owned and pulls fail); `vps.ps1` therefore never calls git over SSH, updates go through the worker or the limited `AutoGrid-Update` task.
- **Vercel:** the frontend is also deployed publicly through the Vercel GitHub integration (project `auto-grid-next-js`, root directory `frontend_nextjs`). Every PR branch gets a preview deployment (the `vercel[bot]` comment on the PR); there's no `vercel.json` in the repo, so the settings live in the Vercel dashboard. Everything in `NEXT_PUBLIC_*` ends up in the public JS bundle there, so never set secrets such as `NEXT_PUBLIC_WORKER_API_KEY` in Vercel. The worker address and API key are no longer build-time env vars: each visitor enters them once in the browser (the "VPS verbinden"/"Connect VPS" dialog, `src/store/useConnectionStore.ts`), stored in that browser's `localStorage` only and sent straight from the browser to the worker — Vercel's server never sees them. `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WORKER_API_KEY` in `.env.local` are just the seed value used locally when nothing is stored yet (SYS-07 in `docs/features/features.yaml`).

The worker can't run on the Mac (MT5 is Windows-only), so don't start it locally: `npm run dev` and `npm run dev:backend` aren't meant for this setup. Worker changes can only be checked statically here; they get tested once they're pulled onto the VPS and the worker is restarted.

## Commands

Frontend (run inside `frontend_nextjs/`):

```bash
npm run dev            # next dev + Python worker concurrently (needs worker_python/.venv; Windows only)
npm run dev:frontend   # Next.js only, http://localhost:3000
npm run dev:backend    # worker only (worker_python/.venv/bin/python main.py)
npm run build
npm run lint
```

Worker (run inside `worker_python/`):

```bash
pip install -r requirements.txt
python main.py         # uvicorn on 0.0.0.0:8000; set ENV=development for auto-reload
```

Worker connection: the address and API key are runtime state, not a build-time env var. `src/store/useConnectionStore.ts` holds them (Zustand `persist`, `localStorage` key `grid-robot-connection`); the "VPS verbinden"/"Connect VPS" dialog (`src/components/connection/ConnectionDialog.tsx`) writes them after a successful test against `GET /api/system/platform`, and a connection link (`#connect=…`, `src/lib/connectionCode.ts`) can prefill both. `frontend_nextjs/.env.local`'s `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WORKER_API_KEY` are only the seed value used the first time nothing is stored yet (local dev and the mocked e2e build); there is no hard-coded fallback address anymore. `NEXT_PUBLIC_WS_URL` is unused; the WebSocket URL is derived from the stored address in `toWsUrl()` (`src/lib/connectionCode.ts`, used by `useWebSocketManager.ts`). Worker CORS uses `ALLOWED_ORIGINS` (comma-separated, default `*`).

API key: the worker reads `WORKER_API_KEY` (set on the VPS with `setx`, see `docs/windows_start_guide.md`). When it's set, every `/api/*` request must send the header `X-API-Key` (otherwise 401) and `/ws/stream` must pass `?api_key=…` (browsers can't set WebSocket headers); the check lives in `worker_python/src/api/auth.py`, the middleware in `main.py`, the WS check in `ws_server.py`. When it's unset the worker stays open as before and logs a warning at startup. The frontend reads the key from the connection store: use `axiosInstance` (attaches it via an interceptor) or `getWorkerHeaders()` from `src/lib/api.ts` for every worker call (never bare `axios`/`fetch` without them), and `toWsUrl()` appends it for the WebSocket.

Multi-user (USR-01…08, `docs/mehrbenutzer.md`, German): `WORKER_API_KEY` is the **admin** key and sees every account; the admin creates users on the page `/users` (`GET/POST /api/users`, `POST /api/users/{id}/key`, `DELETE /api/users/{id}`), each with a personal key (only its sha256 lives in the gitignored `configs/users.json`, shown once on creation). The worker maps every `X-API-Key`/`?api_key=` to a role in `src/api/auth.py` (`authenticate()` → `Principal`, set on `request.state.principal` by the middleware in `main.py`) and enforces ownership in `src/api/access.py` (`account_access` dependency on every account-scoped route: a user only reaches accounts whose `owner` is their user id, everything else is 404; admin unchanged). Accounts carry `owner` (set by the worker on create; only the admin changes it; legacy accounts without owner belong to the admin). `GET /api/auth/me` tells the frontend the role (`useAuthStore`, `useIsAdmin()`); admin-only UI: `/vps`, `/users`, the update menu (`AdminOnly`, `AppNav`). A new account-scoped route must get `dependencies=[Depends(account_access)]`, a new admin-only route `Depends(require_admin)`. Without `WORKER_API_KEY` and without users the worker stays open (everyone admin); with users but no `WORKER_API_KEY` a request without key gets 401.

MT5 passwords never leave the worker: account responses go through `_public_account()` (`src/api/helpers.py`), which drops `password` and adds `has_password`. On `PUT /api/accounts/{id}` an empty or missing password keeps the stored one, so the edit form starts with an empty password field.

## Tests

Feature catalog `docs/features/features.yaml` (features in test order) → generated checklist `docs/features/FEATURES.md`. Every test carries its feature ID; in Claude Code the `/feature-test` skill (`.claude/skills/feature-test/SKILL.md`) runs the tests and reports. A new or changed feature needs a catalog entry and a tagged test (`hooks/RULES.md` §4).

```bash
scripts/features/run.sh              # unit + api + e2e, then regenerate FEATURES.md
scripts/features/run.sh ZON          # one category (or one feature: ENG-05)
scripts/features/run.sh unit ENG-05  # one tier + filter
scripts/features/run.sh live         # against the VPS worker, DEMO account, read-only
scripts/features/run.sh next | show ID | sign ID bestanden "Notiz"
```

- **unit / api** (`worker_python/tests/`, pytest; needs `pip install -r requirements-dev.txt` in `worker_python/.venv`): the engine runs against `tests/fakes/fake_mt5.py`, an in-memory broker, so no MT5 is needed; API tests use FastAPI's `TestClient` with all paths redirected to a tmp dir. Tag with `@pytest.mark.feature("ENG-05")`; known bugs are `xfail(strict=True)`.
- **e2e** (`frontend_nextjs/e2e/mocked/`, Playwright, `npm run test:e2e`): a production build in `.next-e2e` (`NEXT_DIST_DIR`, so it runs next to `npm run dev:frontend`) against a mocked worker (`e2e/fixtures/mock-worker.ts`, mirrors `worker_python/src/api/*`; fails on missing `X-API-Key` or unknown endpoints). Tag with `{ tag: '@ZON-05' }`. Stable selectors are `data-testid`/aria attributes (`zone-card`, `metric-*`, `bot-status`, `log-output` …).
- **live** (`frontend_nextjs/e2e/live/`, `npm run test:live`): uses `.env.local` and the account from `hooks/test-account.local.md`; skips unless it's DEMO. Read-only by default; trading tests need `E2E_LIVE_DEMO=1` (and `E2E_LIVE_BOT_RESTART=1` for stop/start) and only run when the user explicitly asks (`hooks/RULES.md` §3).
- **CI** (`.github/workflows/tests.yml`) runs the catalog check, worker tests, and frontend lint + tsc + e2e on every PR and push to `main`.

## Versioning

The GitHub Action `.github/workflows/version-bump.yml` bumps the patch version on every push to `main` (including PR merges): it rewrites `VERSION` and `frontend_nextjs/src/app/version.ts` and pushes a `chore: auto bump version to vX.Y.Z` commit to `main`. Don't edit these two files by hand, and pull `main` after a merge before pushing again. The worker's update check (`src/utils/self_updater.py`) compares the local `VERSION` with `origin/main`. This replaces the former local `.git/hooks/pre-push` hook; don't reinstall it, or versions get bumped twice.

## Architecture

### Frontend ↔ Worker
- REST under `/api/*` (FastAPI routers in `worker_python/src/api/`, one module per domain: accounts, bot_control, settings, symbols, logs, market, system, ui_state; shared Pydantic models in `models.py`, error handling in `errors.py`). `market` serves the planned Analyse page (chart/statistics/backtest; rules in `docs/analyse-regeln.md`); so far the read-only admin `GET /api/market/{id}/time-check` (ANA-13), `GET /api/market/{id}/clock` (broker clock offset for the calendar, ANA-10), and the SQLite market database `data/market.sqlite` (`src/utils/market_db.py` + `market_sync.py`): `GET /api/market/{id}/rates` / `coverage` fetch only missing candle ranges from MT5 (coverage states complete/gap_confirmed/unavailable, ANA-04) and `GET /api/history/{id}/deals` archives all deals, with the zone registry written on every settings save (ANA-07). The page itself is `/chart` (menu „Analyse“), state in the URL (`useAnalysisParams`), time model in `src/lib/serverTime.ts`. Data queries from the API process (symbol list, Analyse) connect with `data_query=True`: no `mt5.login()` when the terminal is already logged into that account and server, and no account switch on a terminal where another account's bot is running (error instead), so a running bot's session stays untouched.
- WebSocket at `/ws/stream` (`src/api/ws_server.py`, mounted under `/ws` in `main.py`) pushes live metrics, logs, and status. Each connection gets the metrics of the account in `?account_id=` (the one selected in the browser; without it, the first account in `accounts.json`): from the API process's MT5 only if that terminal is logged into this account, otherwise from the bot process's metrics file. On the client, `src/store/useWebSocketManager.ts` owns the connection (reconnects when the selected account changes) and routes messages into the stores.
- Frontend HTTP calls go through `axiosInstance` in `src/lib/api.ts` (it sends the `ngrok-skip-browser-warning` header). Zone-specific calls live in `src/services/zoneApi.ts`.

### Frontend state
Zustand domain stores in `src/store/` (`useAccountStore`, `useSettingsStore`, `useSystemStore`, `useBotRuntimeStore`, `useLogsStore`) are the single source of truth. Hooks that fetch shared data must also write the result into the global store, not just into local state; otherwise dropdowns go stale and you get 409 errors (see `AGENTS.md` for the pattern). After a mutation, refetch to refresh the store. Components read from the stores. `useMT5Scanner` is deliberately local-only. Account selection goes through `selectAccount()` (`src/store/utils/selectAccount.ts`, used by the dashboard and the Analyse page): switching clears the old account's settings and runtime at once. Settings are loaded with `useAccountSettings(accountId)` (`src/hooks/`), which records `useSettingsStore.loadedAccount`; show zones only when `loadedAccount` equals the selected account.

### Worker process model
- The FastAPI process doesn't trade. `src/utils/bot_manager.py` starts one **detached subprocess per MT5 account** (`python -u src/core/bot_runner.py <account_id> <engine_name>`) and tracks it via PID files in `logs/`. Starting or stopping a bot means managing that process.
- `src/utils/bot_watchdog.py` (started in `main.py`'s startup handler) restarts a bot that crashed or hangs (no metrics write for 10 min). It watches only bots started with `/start` (plus bots still running when the worker boots) until `/stop`. The watch list lives in memory, so bots that died during a worker/VPS restart are not revived. It gives up after 5 restarts in 30 min. `/start`, `/stop` and the watchdog share a per-account `account_lock`.
- Trading loop: `bot_runner` → `loop` → `grid_orchestrator`, which coordinates `grid_zone_selector`/`grid_zone_state`, the `grid_execution/` package (level math, placement, validation), `grid_order_manager` → `grid_orders` (the only MT5 order/position CRUD gateway, magic-number based; every zone has a fixed `magic` the worker assigns on save in `src/utils/zone_magic.py`, ENG-27, so the engine maps orders/positions to zones via `zone_index_by_magic`, never via list position; when a zone is deleted the running bot re-keys its index-keyed state on the next settings reload, `grid_zone_state.rekey_zone_state`), `grid_remote` (mobile control via MT5 signals), and `grid_metrics` (telemetry).
- `auto_grid_engine.py` is the legacy monolithic engine, kept for backward compatibility. Put new logic in the modular files.
- MT5 connection/errors: `src/utils/mt5_connection.py`, `mt5_helpers.py` (retry/timeout), `mt5_errors.py` (error-code parsing, zombie-process cleanup, LIVE/DEMO safety check).

### Persistence (all paths from `src/utils/paths.py`, relative to `worker_python/`)
- `configs/settings_<accountId>_<Engine_Name>.json` – per-account settings and zones; `configs/accounts.json` – account list
- `data/state_<accountId>.json` – runtime state; MT5 is the source of truth and `state_manager.py` rebuilds this file from MT5 on startup
- `data/fractal_state_<accountId>.json` – fractal zones: handled (filled / manually deleted) fractals per zone and side, so they aren't traded again after a restart
- `logs/` – per-account logs and PID files
All of these are gitignored and may contain credentials.

## Hooks & Kurallar

- `hooks/` klasörü: git `pre-commit`/`pre-push` + Claude Code hook'ları (`.claude/settings.json`). Klonladıktan sonra bir kez: `bash hooks/install.sh`. Detay: `hooks/README.md`.
- Kurallar (GitHub'a yükleme, uyumluluk, test protokolü): `hooks/RULES.md`. Hook hata verirse `--no-verify` ile geçme, hatayı düzelt.
- **"Test et" denince:** önce `hooks/test-account.local.md` dosyasını oku (gitignore'lu demo hesap; şifre içermez), worker'da kayıtlı o hesabı seç, mevcut datayı kullan. Şifre forma yazılmaz. Protokol: `hooks/RULES.md` §3.
- **Branch-Aufräumen:** ein Branch, der über einen gemergten PR (oder direkt) in `main` aufgegangen ist, wird gelöscht (lokal + remote) — nicht als offene Nachfrage stehen lassen. Vor dem Löschen mit `git merge-base --is-ancestor <branch> main` verifizieren, dass er wirklich gemergt ist. Nicht gemergte Branches nur melden, nicht löschen.

## Conventions

- **UI ↔ backend sync is mandatory** (from `.agents/rules/token-saver.md`): a new or changed setting/parameter in the worker (engine, config JSON, Pydantic model) is not done until the matching UI field (zone components in `src/components/zone/`, `SettingsForm`, stores, types) reads and writes it correctly.
- **UI strings go through i18n** (`frontend_nextjs/src/i18n`, languages tr/en/de, default `tr`): never hard-code user-visible text. Add the key to the matching area file in `src/i18n/messages/` with all three languages side by side (tsc fails on a missing key), then use `useT()` in components or `t()` outside React (toasts in hooks, stores, `apiError`); use `useFormat()` for numbers/times. Values sent to the worker (e.g. the `clear_*`/`exit_condition` strings in zones) and worker messages (`detail`, log lines) are not translated. In e2e tests take texts from `msg('key')` (`e2e/fixtures/i18n.ts`) instead of literals.
- **Every setting, field and button needs a tooltip** (`hooks/RULES.md` §5): `hint` is a required prop of `InputField`, `Switch`, `Button`, tab items and `ConfirmModal` (tsc fails without it); fields get an (i) icon, buttons a hover/focus tooltip, all via `src/components/ui/tooltip.tsx`. The text is an i18n key `<label-key>.hint` in `src/i18n/messages/hints.ts` (tr/en/de) and says what the control does, its unit/effect and, if it is disabled, why. A plain `<button>`/`<input>` outside `Tooltip`/`InputField` fails the e2e coverage test `UI-07`; no native `title=` for explanations.
- Code comments, logs, and docs are mostly in Turkish. Match the language of the file you're editing.
- **Library docs:** for questions or code involving Next.js, React, Tailwind, Zustand, lightweight-charts or FastAPI, look up current docs with the Context7 MCP (`.mcp.json`) first. For Next.js also check `frontend_nextjs/node_modules/next/dist/docs/` (see `frontend_nextjs/AGENTS.md`).

## Modell-Nutzung
- Für Codebase-Erkundung, Suche und einfache Recherche: Subagent `explorer` (Haiku).
- Für Code-Review: Subagent `reviewer` (Sonnet), nach fertigen Änderungen und vor Commit/PR. Er ist nur lesend (kein `git diff`), also Diff bzw. geänderte Dateien und Zweck im Prompt übergeben.
- Definitionen: `.claude/agents/explorer.md`, `.claude/agents/reviewer.md`.
- Für Architekturentscheidungen und schwieriges Debugging: mich darauf hinweisen,
  dass ein Wechsel zu Opus (oder höherer /effort) sinnvoll wäre, statt selbst zu raten.
- Nicht während einer laufenden Aufgabe das Modell wechseln.