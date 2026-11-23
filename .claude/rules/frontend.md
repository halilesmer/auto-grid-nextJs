---
paths:
  - "frontend_nextjs/**"
---

# Frontend (Next.js 16, React 19)

`frontend_nextjs/AGENTS.md` applies first: this Next.js version has breaking changes, read `frontend_nextjs/node_modules/next/dist/docs/` before you write Next.js code.

## Worker connection

Worker connection: the address and API key are runtime state, not a build-time env var. `src/store/useConnectionStore.ts` holds them (Zustand `persist`, `localStorage` key `grid-robot-connection`); the "VPS verbinden"/"Connect VPS" dialog (`src/components/connection/ConnectionDialog.tsx`) writes them after a successful test against `GET /api/system/platform`, and a connection link (`#connect=…`, `src/lib/connectionCode.ts`) can prefill both. `frontend_nextjs/.env.local`'s `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WORKER_API_KEY` are only the seed value used the first time nothing is stored yet (local dev and the mocked e2e build); there is no hard-coded fallback address anymore. `NEXT_PUBLIC_WS_URL` is unused; the WebSocket URL is derived from the stored address in `toWsUrl()` (`src/lib/connectionCode.ts`, used by `useWebSocketManager.ts`).

Every worker call sends the API key: use `axiosInstance` (attaches it via an interceptor) or `getWorkerHeaders()` from `src/lib/api.ts`, never bare `axios`/`fetch`; `toWsUrl()` appends it for the WebSocket. Roles: `GET /api/auth/me` → `useAuthStore`, `useIsAdmin()`; admin-only UI (`/vps`, `/users`, the update menu) uses `AdminOnly`/`AppNav`.

- Frontend HTTP calls go through `axiosInstance` in `src/lib/api.ts` (it sends the `ngrok-skip-browser-warning` header). Zone-specific calls live in `src/services/zoneApi.ts`.

## Pages and URL model

- `/chart` (menu „Chart“, UI-22): one chart without modes. URL model in `src/lib/chart/chartUrl.ts` (`parseChartUrl`/`buildChartUrl`, `src/hooks/useChartParams.ts`); `mode=` of old links is ignored and dropped on every write. `tf` defaults to H4, range to "All"; formations only on D1/H4/H1/M15. `/formasyon?…` redirects to `/chart?…` (`next.config.ts`).
- `/stats` (menu „Statistik“, UI-23): same address model, shared state in `src/hooks/useChartContext.ts`; old `/chart?…&tab=stats` links redirect there.
- `/backtest`: the only user of `useAnalysisParams`.
- State lives in the URL; the time model is `src/lib/serverTime.ts`.
- `/vps` (admin): the route `src/app/api/vps/[action]/route.ts` runs `ops/windows/vps.ps1` over SSH (`src/lib/server/vpsSsh.ts`, server-only env `VPS_SSH_HOST`/`VPS_SSH_KEY`/`VPS_REPO_PATH`, localhost only).
- Zone-specific worker calls live in `src/services/zoneApi.ts`.

## State

Zustand domain stores in `src/store/` (`useAccountStore`, `useSettingsStore`, `useSystemStore`, `useBotRuntimeStore`, `useLogsStore`) are the single source of truth. Hooks that fetch shared data must also write the result into the global store, not just into local state; otherwise dropdowns go stale and you get 409 errors (see `AGENTS.md` for the pattern). After a mutation, refetch to refresh the store. Components read from the stores. `useMT5Scanner` is deliberately local-only. Account selection goes through `selectAccount()` (`src/store/utils/selectAccount.ts`, used by the dashboard and the Analyse page): switching clears the old account's settings and runtime at once. Settings are loaded with `useAccountSettings(accountId)` (`src/hooks/`), which records `useSettingsStore.loadedAccount`; show zones only when `loadedAccount` equals the selected account.

## UI rules

- **UI strings go through i18n** (`frontend_nextjs/src/i18n`, languages tr/en/de, default `tr`): never hard-code user-visible text. Add the key to the matching area file in `src/i18n/messages/` with all three languages side by side (tsc fails on a missing key), then use `useT()` in components or `t()` outside React (toasts in hooks, stores, `apiError`); use `useFormat()` for numbers/times. Values sent to the worker (e.g. the `clear_*`/`exit_condition` strings in zones) and worker messages (`detail`, log lines) are not translated. In e2e tests take texts from `msg('key')` (`e2e/fixtures/i18n.ts`) instead of literals.
- **Every setting, field and button needs a tooltip** (`hooks/RULES.md` §5): `hint` is a required prop of `InputField`, `Switch`, `Button`, tab items and `ConfirmModal` (tsc fails without it); fields get an (i) icon, buttons a hover/focus tooltip, all via `src/components/ui/tooltip.tsx`. The text is an i18n key `<label-key>.hint` in `src/i18n/messages/hints.ts` (tr/en/de) and says what the control does, its unit/effect and, if it is disabled, why. A plain `<button>`/`<input>` outside `Tooltip`/`InputField` fails the e2e coverage test `UI-07`; no native `title=` for explanations.
- **Design first:** for design or frontend changes (new or changed visible UI), Claude first proposes a design as an Artifact and finishes it together with Halil. Code changes start only after he approves the design.
- **Screen sizes:** design, build and measure visible UI only for 13–26 inch screens; do not design or measure a phone or tablet layout, and leave the existing mobile layout as it is (Halil, 2026-11-23).

## Vercel

The frontend is also deployed publicly through the Vercel GitHub integration (project `auto-grid-next-js`, root directory `frontend_nextjs`). Every PR branch gets a preview deployment (the `vercel[bot]` comment on the PR); there's no `vercel.json` in the repo, so the settings live in the Vercel dashboard. Everything in `NEXT_PUBLIC_*` ends up in the public JS bundle there, so never set secrets such as `NEXT_PUBLIC_WORKER_API_KEY` in Vercel. The worker address and API key are no longer build-time env vars: each visitor enters them once in the browser (the "VPS verbinden"/"Connect VPS" dialog, `src/store/useConnectionStore.ts`), stored in that browser's `localStorage` only and sent straight from the browser to the worker — Vercel's server never sees them. `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WORKER_API_KEY` in `.env.local` are just the seed value used locally when nothing is stored yet (SYS-07 in `docs/features/features.yaml`).
