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
- **Windows VPS:** the worker only, started with `worker_python/start.bat` (uvicorn crash watchdog via `run_uvicorn_watchdog.bat`, ngrok crash watchdog via `run_ngrok_watchdog.bat`). See `docs/windows_start_guide.md`. After the one-time `worker_python/ops/windows/setup_vps.ps1` (admin: OpenSSH key-only, auto-login, scheduled tasks `AutoGrid-Start`/`AutoGrid-Update` with RunLevel Limited), the VPS is controlled from the Mac via the page `/vps`: the Next.js route `src/app/api/vps/[action]/route.ts` runs `ops/windows/vps.ps1` over SSH (`src/lib/server/vpsSsh.ts`, server-only env `VPS_SSH_HOST`/`VPS_SSH_KEY`/`VPS_REPO_PATH`, localhost only). Under the watchdog the worker auto-updates from `origin/main` (`src/utils/auto_updater.py`, `AUTO_UPDATE_MINUTES`, default 5) and resumes bots that were running before a restart (`data/watched_bots.json`). Rights rule: never run `git` on the VPS as administrator (files would become admin-owned and pulls fail); `vps.ps1` therefore never calls git over SSH, updates go through the worker or the limited `AutoGrid-Update` task.
- **Vercel:** the frontend is also deployed publicly through the Vercel GitHub integration (project `auto-grid-next-js`, root directory `frontend_nextjs`). Every PR branch gets a preview deployment (the `vercel[bot]` comment on the PR); there's no `vercel.json` in the repo, so the settings live in the Vercel dashboard. Everything in `NEXT_PUBLIC_*` ends up in the public JS bundle there, so never set secrets such as `NEXT_PUBLIC_WORKER_API_KEY` in Vercel. Once the worker has `WORKER_API_KEY` set, the Vercel deployment gets 401 from the worker; only the local frontend (key in `.env.local`) works.

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

Frontend env (`frontend_nextjs/.env.local`): `NEXT_PUBLIC_API_URL` (base URL without `/api`, which is appended automatically). The WebSocket URL is derived from `API_BASE` in `buildWsUrl()` (`src/store/useWebSocketManager.ts`), so `NEXT_PUBLIC_WS_URL` is currently unused. If `NEXT_PUBLIC_API_URL` is missing, REST and WebSocket both fall back to the hard-coded ngrok URL in `src/lib/api.ts`. Worker CORS uses `ALLOWED_ORIGINS` (comma-separated, default `*`).

API key: the worker reads `WORKER_API_KEY` (set on the VPS with `setx`, see `docs/windows_start_guide.md`). When it's set, every `/api/*` request must send the header `X-API-Key` (otherwise 401) and `/ws/stream` must pass `?api_key=…` (browsers can't set WebSocket headers); the check lives in `worker_python/src/api/auth.py`, the middleware in `main.py`, the WS check in `ws_server.py`. When it's unset the worker stays open as before and logs a warning at startup. The frontend sends `NEXT_PUBLIC_WORKER_API_KEY` from `.env.local`: use `axiosInstance` or `WORKER_HEADERS` from `src/lib/api.ts` for every worker call (never bare `axios`/`fetch` without them), and `buildWsUrl()` appends the key for the WebSocket.

MT5 passwords never leave the worker: account responses go through `_public_account()` (`src/api/helpers.py`), which drops `password` and adds `has_password`. On `PUT /api/accounts/{id}` an empty or missing password keeps the stored one, so the edit form starts with an empty password field.

## Tests

Feature catalog `docs/features/features.yaml` (85 features, in test order) → generated checklist `docs/features/FEATURES.md`. Every test carries its feature ID; in Claude Code the `/feature-test` skill (`.claude/skills/feature-test/SKILL.md`) runs the tests and reports. A new or changed feature needs a catalog entry and a tagged test (`hooks/RULES.md` §4).

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
- REST under `/api/*` (FastAPI routers in `worker_python/src/api/`, one module per domain: accounts, bot_control, settings, symbols, logs, system, ui_state; shared Pydantic models in `models.py`, error handling in `errors.py`).
- WebSocket at `/ws/stream` (`src/api/ws_server.py`, mounted under `/ws` in `main.py`) pushes live metrics, logs, and status. On the client, `src/store/useWebSocketManager.ts` owns the connection and routes messages into the stores.
- Frontend HTTP calls go through `axiosInstance` in `src/lib/api.ts` (it sends the `ngrok-skip-browser-warning` header). Zone-specific calls live in `src/services/zoneApi.ts`.

### Frontend state
Zustand domain stores in `src/store/` (`useAccountStore`, `useSettingsStore`, `useSystemStore`, `useBotRuntimeStore`, `useLogsStore`) are the single source of truth. Hooks that fetch shared data must also write the result into the global store, not just into local state; otherwise dropdowns go stale and you get 409 errors (see `AGENTS.md` for the pattern). After a mutation, refetch to refresh the store. Components read from the stores. `useMT5Scanner` is deliberately local-only.

### Worker process model
- The FastAPI process doesn't trade. `src/utils/bot_manager.py` starts one **detached subprocess per MT5 account** (`python -u src/core/bot_runner.py <account_id> <engine_name>`) and tracks it via PID files in `logs/`. Starting or stopping a bot means managing that process.
- `src/utils/bot_watchdog.py` (started in `main.py`'s startup handler) restarts a bot that crashed or hangs (no metrics write for 10 min). It watches only bots started with `/start` (plus bots still running when the worker boots) until `/stop`. The watch list lives in memory, so bots that died during a worker/VPS restart are not revived. It gives up after 5 restarts in 30 min. `/start`, `/stop` and the watchdog share a per-account `account_lock`.
- Trading loop: `bot_runner` → `loop` → `grid_orchestrator`, which coordinates `grid_zone_selector`/`grid_zone_state`, the `grid_execution/` package (level math, placement, validation), `grid_order_manager` → `grid_orders` (the only MT5 order/position CRUD gateway, magic-number based), `grid_remote` (mobile control via MT5 signals), and `grid_metrics` (telemetry).
- `auto_grid_engine.py` is the legacy monolithic engine, kept for backward compatibility. Put new logic in the modular files.
- MT5 connection/errors: `src/utils/mt5_connection.py`, `mt5_helpers.py` (retry/timeout), `mt5_errors.py` (error-code parsing, zombie-process cleanup, LIVE/DEMO safety check).

### Persistence (all paths from `src/utils/paths.py`, relative to `worker_python/`)
- `configs/settings_<accountId>_<Engine_Name>.json` – per-account settings and zones; `configs/accounts.json` – account list
- `data/state_<accountId>.json` – runtime state; MT5 is the source of truth and `state_manager.py` rebuilds this file from MT5 on startup
- `logs/` – per-account logs and PID files
All of these are gitignored and may contain credentials.

## Hooks & Kurallar

- `hooks/` klasörü: git `pre-commit`/`pre-push` + Claude Code hook'ları (`.claude/settings.json`). Klonladıktan sonra bir kez: `bash hooks/install.sh`. Detay: `hooks/README.md`.
- Kurallar (GitHub'a yükleme, uyumluluk, test protokolü): `hooks/RULES.md`. Hook hata verirse `--no-verify` ile geçme, hatayı düzelt.
- **"Test et" denince:** önce `hooks/test-account.local.md` dosyasını oku (gitignore'lu demo hesap; şifre içermez), worker'da kayıtlı o hesabı seç, mevcut datayı kullan. Şifre forma yazılmaz. Protokol: `hooks/RULES.md` §3.

## Conventions

- **UI ↔ backend sync is mandatory** (from `.agents/rules/token-saver.md`): a new or changed setting/parameter in the worker (engine, config JSON, Pydantic model) is not done until the matching UI field (zone components in `src/components/zone/`, `SettingsForm`, stores, types) reads and writes it correctly.
- Code comments, logs, and docs are mostly in Turkish. Match the language of the file you're editing.
- **Library docs:** for questions or code involving Next.js, React, Tailwind, Zustand, lightweight-charts or FastAPI, look up current docs with the Context7 MCP (`.mcp.json`) first. For Next.js also check `frontend_nextjs/node_modules/next/dist/docs/` (see `frontend_nextjs/AGENTS.md`).
