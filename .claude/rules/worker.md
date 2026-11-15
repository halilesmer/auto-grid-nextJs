---
paths:
  - "worker_python/**"
  - "ops/**"
---

# Worker (Python, Windows VPS)

The worker cannot run on the Mac (MT5 is Windows-only). Check worker changes statically and with the unit/api tests; they are live only after the VPS pulled them.

## VPS setup and self-healing

- **Windows VPS:** the worker only, started with `worker_python/start.bat` (uvicorn crash watchdog via `run_uvicorn_watchdog.bat`, ngrok crash watchdog via `run_ngrok_watchdog.bat`). See `docs/windows_start_guide.md`. A fresh VPS is set up with one command in an admin PowerShell, `irm .../ops/windows/bootstrap.ps1 | iex` (installs Git/Python 3.11/the VC++ redistributable if missing, clones the repo, sets up the venv + `requirements.txt`, generates `WORKER_API_KEY`, configures ngrok, then calls `setup_vps.ps1` and starts the worker, ending with a connection link for the web UI, `ops/windows/connect-link.ps1`); repo clone/venv/pip/ngrok run in their own scheduled task with `RunLevel Limited` (`bootstrap-user.ps1`), never elevated. After that (or the one-time `worker_python/ops/windows/setup_vps.ps1` on its own, admin: `-PublicKey` optional — auto-login, scheduled tasks `AutoGrid-Start`/`AutoGrid-Update` with RunLevel Limited, and with `-PublicKey` also OpenSSH key-only), the VPS can also be controlled from the Mac via the page `/vps`: the Next.js route `src/app/api/vps/[action]/route.ts` runs `ops/windows/vps.ps1` over SSH (`src/lib/server/vpsSsh.ts`, server-only env `VPS_SSH_HOST`/`VPS_SSH_KEY`/`VPS_REPO_PATH`, localhost only). Under the watchdog the worker auto-updates from `origin/main` (`src/utils/auto_updater.py`, `AUTO_UPDATE_MINUTES`, default 5) and resumes bots that were running before a restart (`data/watched_bots.json`). Self-healing without remote access: the scheduled task `AutoGrid-Tunnel` (`ops/windows/tunnel_watchdog.ps1`, every 5 min, VPS-10) checks that the public ngrok URL answers `/api/system/platform`, restarts ngrok (or worker + ngrok via `AutoGrid-Start`) and reboots the VPS after 3 failures in a row (at most once an hour, 3 times a day); it runs elevated only for the reboot and never runs git or starts worker/ngrok itself. Rights rule: never run `git` on the VPS as administrator (files would become admin-owned and pulls fail); `vps.ps1` therefore never calls git over SSH, updates go through the worker or the limited `AutoGrid-Update` task.

## API key and roles

Multi-user (USR-01…08, `docs/mehrbenutzer.md`, German): `WORKER_API_KEY` is the **admin** key and sees every account; the admin creates users on the page `/users` (`GET/POST /api/users`, `POST /api/users/{id}/key`, `DELETE /api/users/{id}`), each with a personal key (only its sha256 lives in the gitignored `configs/users.json`, shown once on creation). The worker maps every `X-API-Key`/`?api_key=` to a role in `src/api/auth.py` (`authenticate()` → `Principal`, set on `request.state.principal` by the middleware in `main.py`) and enforces ownership in `src/api/access.py` (`account_access` dependency on every account-scoped route: a user only reaches accounts whose `owner` is their user id, everything else is 404; admin unchanged). Accounts carry `owner` (set by the worker on create; only the admin changes it; legacy accounts without owner belong to the admin). `GET /api/auth/me` tells the frontend the role (`useAuthStore`, `useIsAdmin()`); admin-only UI: `/vps`, `/users`, the update menu (`AdminOnly`, `AppNav`). A new account-scoped route must get `dependencies=[Depends(account_access)]`, a new admin-only route `Depends(require_admin)`. Without `WORKER_API_KEY` and without users the worker stays open (everyone admin); with users but no `WORKER_API_KEY` a request without key gets 401.

MT5 passwords never leave the worker: account responses go through `_public_account()` (`src/api/helpers.py`), which drops `password` and adds `has_password`. On `PUT /api/accounts/{id}` an empty or missing password keeps the stored one, so the edit form starts with an empty password field.

API key: the worker reads `WORKER_API_KEY` (set on the VPS with `setx`, see `docs/windows_start_guide.md`). When it's set, every `/api/*` request must send the header `X-API-Key` (otherwise 401) and `/ws/stream` must pass `?api_key=…` (browsers can't set WebSocket headers); the check lives in `worker_python/src/api/auth.py`, the middleware in `main.py`, the WS check in `ws_server.py`. When it's unset the worker stays open as before and logs a warning at startup. The frontend reads the key from the connection store: use `axiosInstance` (attaches it via an interceptor) or `getWorkerHeaders()` from `src/lib/api.ts` for every worker call (never bare `axios`/`fetch` without them), and `toWsUrl()` appends it for the WebSocket.

Worker CORS uses `ALLOWED_ORIGINS` (comma-separated, default `*`).

## REST and WebSocket

- REST under `/api/*`: FastAPI routers in `src/api/`, one module per domain (accounts, bot_control, settings, symbols, logs, market, system, ui_state, ui_prefs, news); shared Pydantic models in `models.py`, error handling in `errors.py`.
- A new account-scoped route gets `dependencies=[Depends(account_access)]`, a new admin-only route `Depends(require_admin)`.
- `market`: read-only admin `GET /api/market/{id}/time-check` (ANA-13), `GET /api/market/{id}/clock` (broker clock offset, ANA-10), and the SQLite market database `data/market.sqlite` (`src/utils/market_db.py` + `market_sync.py`). `GET /api/market/{id}/rates` / `coverage` fetch only missing candle ranges from MT5 (coverage states complete/gap_confirmed/unavailable, ANA-04). `GET /api/history/{id}/deals` archives all deals; the zone registry is written on every settings save (ANA-07). Rules for the analysis pages: `docs/analyse-regeln.md`.
- `ui_prefs`: small per-account UI preferences (`GET /api/ui-prefs/{id}`, `PUT /api/ui-prefs/{id}/{key}`, `data/ui_prefs_<id>.json`; NWS-02 stores the news filter there).
- `news` (NWS-01): `GET /api/news/events?from&to&impact&currencies` reads `autogrid_calendar_<lang>.json`, which the MQL5 service `ops/mt5/AutoGridCalendar.mq5` rewrites every minute, one terminal per language (`src/utils/econ_calendar.py`: UTC times, titles merged into `titles`, `lang` query, `forecast_direction`, `stale` after 5 min). Every role can read it; it is not account-bound.
- Data queries from the API process (symbol list, analysis) connect with `data_query=True`: no `mt5.login()` when the terminal is already logged into that account and server, and no account switch on a terminal where another account's bot is running (error instead). A running bot's session stays untouched.
- WebSocket at `/ws/stream` (`src/api/ws_server.py`, mounted under `/ws` in `main.py`) pushes live metrics, logs, and status. Each connection gets the metrics of the account in `?account_id=` (the one selected in the browser; without it, the first account in `accounts.json`): from the API process's MT5 only if that terminal is logged into this account, otherwise from the bot process's metrics file. On the client, `src/store/useWebSocketManager.ts` owns the connection (reconnects when the selected account changes) and routes messages into the stores.

## Process model

- The FastAPI process doesn't trade. `src/utils/bot_manager.py` starts one **detached subprocess per MT5 account** (`python -u src/core/bot_runner.py <account_id> <engine_name>`) and tracks it via PID files in `logs/`. Starting or stopping a bot means managing that process.
- MT5 reads that can take long (candle and tick pieces of `market_sync`) run in reader subprocesses (2 for long fetches, 1 for the newest chunk of a warm chart) (`src/utils/mt5_reader.py`, `python -m src.utils.mt5_reader`, localhost connection with a random key, 1110-A2): a `MetaTrader5` call keeps the GIL while the terminal loads history (82 s measured), so the API process must not make it itself. The API process waits at most the request budget; a job over 300 s kills the reader. Without `MetaTrader5` (Mac, tests) the jobs run in-process (`MT5_READER=inline|process` forces a mode). A new MT5 read that can download history goes through `mt5_reader.run()`.
- `src/utils/bot_watchdog.py` (started in `main.py`'s startup handler) restarts a bot that crashed or hangs (no metrics write for 10 min). It watches only bots started with `/start` (plus bots still running when the worker boots) until `/stop`. The watch list lives in memory, so bots that died during a worker/VPS restart are not revived. It gives up after 5 restarts in 30 min. `/start`, `/stop` and the watchdog share a per-account `account_lock`.
- Trading loop: `bot_runner` → `loop` → `grid_orchestrator`, which coordinates `grid_zone_selector`/`grid_zone_state`, the `grid_execution/` package (level math, placement, validation), `grid_order_manager` → `grid_orders` (the only MT5 order/position CRUD gateway, magic-number based; every zone has a fixed `magic` the worker assigns on save in `src/utils/zone_magic.py`, ENG-27, so the engine maps orders/positions to zones via `zone_index_by_magic`, never via list position; when a zone is deleted the running bot re-keys its index-keyed state on the next settings reload, `grid_zone_state.rekey_zone_state`), `grid_remote` (mobile control via MT5 signals), and `grid_metrics` (telemetry).
- `auto_grid_engine.py` is the legacy monolithic engine, kept for backward compatibility. Put new logic in the modular files.
- MT5 connection/errors: `src/utils/mt5_connection.py`, `mt5_helpers.py` (retry/timeout), `mt5_errors.py` (error-code parsing, zombie-process cleanup, LIVE/DEMO safety check).

## Persistence (paths from `src/utils/paths.py`, relative to `worker_python/`)

- `configs/settings_<accountId>_<Engine_Name>.json` – per-account settings and zones; `configs/accounts.json` – account list
- `data/state_<accountId>.json` – runtime state; MT5 is the source of truth and `state_manager.py` rebuilds this file from MT5 on startup
- `data/fractal_state_<accountId>.json` – fractal zones: handled (filled / manually deleted) fractals per zone and side, so they aren't traded again after a restart
- `data/turns/<accountId>/turns_YYYYMMDD.csv.gz` – bot turn telemetry (ENG-35): start, length and kind of each loop turn, gzip members appended by a background thread, 30 days kept; read by `GET /api/bot/{id}/turns`
- `logs/` – per-account logs and PID files
All of these are gitignored and may contain credentials.

## Commands and versioning

```bash
pip install -r requirements.txt
python main.py         # uvicorn on 0.0.0.0:8000; set ENV=development for auto-reload (Windows only)
```

The worker's update check (`src/utils/self_updater.py`) compares the local `VERSION` with `origin/main`. CI bumps `VERSION`; do not edit it.
