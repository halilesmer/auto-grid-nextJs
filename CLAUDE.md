# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Grid Robot: an algorithmic grid-trading bot for MetaTrader 5. Monorepo with two packages:

- `frontend_nextjs/` – Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, lightweight-charts
- `worker_python/` – FastAPI worker that talks to MT5 (the `MetaTrader5` package is Windows-only; the worker is meant to run on a Windows host/VPS, often exposed via ngrok)

`docs/proje_dosya_krokisi.md` (Turkish) is the maintained architecture map — read it first before larger changes. Parts are stale (e.g. it mentions `grid_position_sync.py`, which no longer exists), so verify against the code.

`frontend_nextjs/AGENTS.md` (loaded via `frontend_nextjs/CLAUDE.md`) applies to all frontend work: this Next.js version has breaking changes — consult `frontend_nextjs/node_modules/next/dist/docs/` before writing Next.js code.

## Commands

Frontend (run inside `frontend_nextjs/`):

```bash
npm run dev            # next dev + Python worker concurrently (needs worker_python/.venv)
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

There is no test suite in either package.

Frontend env (`frontend_nextjs/.env.local`): `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`. If they're missing, `src/lib/api.ts` falls back to a hard-coded ngrok URL. Worker CORS uses `ALLOWED_ORIGINS` (comma-separated, default `*`).

## Versioning

A local `.git/hooks/pre-push` hook bumps the patch version on every push: it rewrites `VERSION` and `frontend_nextjs/src/app/version.ts` and creates a `chore: auto bump version to vX.Y.Z` commit. Don't edit these two files by hand, and expect that extra commit after pushing.

## Architecture

### Frontend ↔ Worker
- REST under `/api/*` (FastAPI routers in `worker_python/src/api/`, one module per domain: accounts, bot_control, settings, symbols, logs, system, ui_state; shared Pydantic models in `models.py`, error handling in `errors.py`).
- WebSocket at `/ws` (`src/api/ws_server.py`) pushes live metrics, logs, and status. On the client, `src/store/useWebSocketManager.ts` owns the connection and routes messages into the stores.
- Frontend HTTP calls go through `axiosInstance` in `src/lib/api.ts` (it sends the `ngrok-skip-browser-warning` header). Zone-specific calls live in `src/services/zoneApi.ts`.

### Frontend state
Zustand domain stores in `src/store/` (`useAccountStore`, `useSettingsStore`, `useSystemStore`, `useBotRuntimeStore`, `useLogsStore`) are the single source of truth. Hooks that fetch shared data must also write the result into the global store, not just into local state; otherwise dropdowns go stale and you get 409 errors (see `AGENTS.md` for the pattern). After a mutation, refetch to refresh the store. Components read from the stores. `useMT5Scanner` is deliberately local-only.

### Worker process model
- The FastAPI process doesn't trade. `src/utils/bot_manager.py` starts one **detached subprocess per MT5 account** (`python -u src/core/bot_runner.py <account_id> <engine_name>`) and tracks it via PID files in `logs/`. Starting or stopping a bot means managing that process.
- Trading loop: `bot_runner` → `loop` → `grid_orchestrator`, which coordinates `grid_zone_selector`/`grid_zone_state`, the `grid_execution/` package (level math, placement, validation), `grid_order_manager` → `grid_orders` (the only MT5 order/position CRUD gateway, magic-number based), `grid_remote` (mobile control via MT5 signals), and `grid_metrics` (telemetry).
- `auto_grid_engine.py` is the legacy monolithic engine, kept for backward compatibility. Put new logic in the modular files.
- MT5 connection/errors: `src/utils/mt5_connection.py`, `mt5_helpers.py` (retry/timeout), `mt5_errors.py` (error-code parsing, zombie-process cleanup, LIVE/DEMO safety check).

### Persistence (all paths from `src/utils/paths.py`, relative to `worker_python/`)
- `configs/settings_<accountId>_<Engine_Name>.json` – per-account settings and zones; `configs/accounts.json` – account list
- `data/state_<accountId>.json` – runtime state; MT5 is the source of truth and `state_manager.py` rebuilds this file from MT5 on startup
- `logs/` – per-account logs and PID files
All of these are gitignored and may contain credentials.

## Conventions

- **UI ↔ backend sync is mandatory** (from `.agents/rules/token-saver.md`): a new or changed setting/parameter in the worker (engine, config JSON, Pydantic model) is not done until the matching UI field (zone components in `src/components/zone/`, `SettingsForm`, stores, types) reads and writes it correctly.
- Code comments, logs, and docs are mostly in Turkish. Match the language of the file you're editing.
