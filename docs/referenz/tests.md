# Tests (detail)

> Moved verbatim from `CLAUDE.md` on 2026-11-12 to shrink the always-loaded context (plan 1112-A2.3). The short rules stay in `CLAUDE.md`; this file holds the detail.


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
- **Before the first push of a PR** run `scripts/features/precheck.sh`: the same steps as CI (catalog, pytest, lint, tsc, all mocked e2e) in CI order; it fails when Playwright ran zero tests (`hooks/RULES.md` §4.8–4.11). The mocked e2e port is per checkout (3300–3999 from the checkout path, 3100 in CI, `E2E_PORT` wins, no reuse of a running server without `E2E_REUSE=1`; SYS-10), so parallel worktrees do not share a test server. Heavy runs wait for a machine-wide lock (`scripts/features/heavy_lock.sh`, SYS-11) and run 3 local Playwright workers (`E2E_WORKERS` changes it).
