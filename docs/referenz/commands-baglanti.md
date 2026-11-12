# Commands, worker connection, API key, multi-user (detail)

> Moved verbatim from `CLAUDE.md` on 2026-11-12 to shrink the always-loaded context (plan 1112-A2.3). The short rules stay in `CLAUDE.md`; this file holds the detail.


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
