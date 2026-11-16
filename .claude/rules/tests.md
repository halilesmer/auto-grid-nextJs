---
paths:
  - "worker_python/tests/**"
  - "frontend_nextjs/e2e/**"
  - "scripts/features/**"
  - "docs/features/**"
---

# Tests

Commands and the pre-PR check are in `CLAUDE.md`. Rules: `hooks/RULES.md` §3 (live protocol) and §4 (catalog, precheck, heavy lock).

- **unit / api** (`worker_python/tests/`, pytest; needs `pip install -r requirements-dev.txt` in `worker_python/.venv`): the engine runs against `tests/fakes/fake_mt5.py`, an in-memory broker, so no MT5 is needed; API tests use FastAPI's `TestClient` with all paths redirected to a tmp dir. Tag with `@pytest.mark.feature("ENG-05")`; known bugs are `xfail(strict=True)`.
- **e2e** (`frontend_nextjs/e2e/mocked/`, Playwright, `npm run test:e2e`): a production build in `.next-e2e` (`NEXT_DIST_DIR`, so it runs next to `npm run dev:frontend`) against a mocked worker (`e2e/fixtures/mock-worker.ts`, mirrors `worker_python/src/api/*`; fails on missing `X-API-Key` or unknown endpoints). Tag with `{ tag: '@ZON-05' }`. Stable selectors are `data-testid`/aria attributes (`zone-card`, `metric-*`, `bot-status`, `log-output` …).
- **live** (`frontend_nextjs/e2e/live/`, `npm run test:live`): uses `.env.local` and the account from `hooks/test-account.local.md`; skips unless it's DEMO. Read-only by default; trading tests need `E2E_LIVE_DEMO=1` (and `E2E_LIVE_BOT_RESTART=1` for stop/start) and only run when the user explicitly asks (`hooks/RULES.md` §3).
- **Before the first push of a PR** run `scripts/features/precheck.sh`: the same steps as CI (catalog, pytest, lint, tsc, all mocked e2e) in CI order; it fails when Playwright ran zero tests (`hooks/RULES.md` §4.8–4.11). The mocked e2e port is per checkout (3300–3999 from the checkout path, 3100 in CI, `E2E_PORT` wins, no reuse of a running server without `E2E_REUSE=1`; SYS-10), so parallel worktrees do not share a test server. Heavy runs wait for a machine-wide lock (`scripts/features/heavy_lock.sh`, SYS-11) and run 3 local Playwright workers (`E2E_WORKERS` changes it).
- **Pointer gestures on the chart:** before an e2e test uses a fixed pixel on the chart of the `/chart` page (a drawing tool, a click or a double click on a drawing), it calls `chartReady(page)` (`e2e/fixtures/chart-ready.ts`), and again after each `page.reload()`. This applies when the formation search starts by itself (`formationAsk: 'auto'`, the default). The chart changes its scale when the formation search finishes; a pixel from before then misses the drawing (journal `2026-11-16-chart-drawing-tests-scan-race`).

  ```ts
  await page.goto(URL);
  await chartReady(page);        // candles loaded, formation search finished
  await page.mouse.click(x, y);  // a fixed pixel is stable only now
  ```
