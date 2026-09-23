This is the [Next.js](https://nextjs.org) frontend of **Grid Robot**, an algorithmic trading bot monorepo. It pairs with a Python worker (`../worker_python`) that talks to MetaTrader 5 over REST and a WebSocket connection for real-time, multi-account trading control.

## Dev setup

The frontend runs locally (e.g. on a Mac). The worker runs on a Windows VPS, because the `MetaTrader5` package is Windows-only, and is exposed through ngrok.

1. Create `.env.local` in this folder and point it at the worker:

   ```bash
   NEXT_PUBLIC_API_URL=https://<your-ngrok-domain>
   ```

   Leave off the trailing `/api`; it's appended automatically. The WebSocket URL (`wss://…/ws/stream`) is derived from the same value, so no separate WebSocket variable is needed.

2. Start the frontend only:

   ```bash
   npm run dev:frontend
   ```

3. Open [http://localhost:3000](http://localhost:3000).

`npm run dev` starts the frontend and a local Python worker together. Use it only on a Windows machine that has `../worker_python/.venv` and MetaTrader 5 installed.

## Backend on the VPS

On the VPS, `worker_python\start.bat` starts the worker (with a crash watchdog) and the ngrok tunnel in two windows. See [`docs/windows_start_guide.md`](../docs/windows_start_guide.md) for the full steps.

The worker's CORS setting reads `ALLOWED_ORIGINS` (comma-separated, default `*`). If you restrict it, include `http://localhost:3000`.

Backend changes are only live after they're pulled onto the VPS and the worker is restarted.

## Other scripts

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # eslint
```
