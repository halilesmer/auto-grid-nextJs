---
name: feature-test
description: Run and maintain the Auto Grid feature tests and the feature checklist (docs/features/FEATURES.md). Use when the user types /feature-test, asks to test one feature or a category ("teste ENG-05", "teste ZON", "alle Tests", "Live-Tests"), wants the checklist updated or the next open feature, records a manual test result ("ENG-13 bestanden"), or adds/changes a feature that needs a catalog entry and a test.
---

# Auto Grid feature tests

The feature catalog `docs/features/features.yaml` is the single source of truth: 73 features in 11
categories (SYS, ACC, SET, SYM, ZON, BOT, ENG, MET, LOG, UPD, UI), listed in test order. Every test
carries its feature ID, and `scripts/features/update_checklist.py` turns the test reports into the
checklist `docs/features/FEATURES.md`. Never edit FEATURES.md or results.json by hand.

Talk to the user in German (the catalog, checklist and test names are German).

## Arguments

`/feature-test [ARG]`, where ARG is optional:

| ARG | Meaning |
|---|---|
| (empty) | all tiers that run without the VPS: unit + api + e2e |
| `ENG-05` | one feature, every tier that has tests for it |
| `ZON` | one category |
| `unit` / `api` / `e2e` | one tier (optionally followed by an ID or category) |
| `live` | live tests against the VPS worker (read-only) |
| `next` | show the next open feature in test order |
| `show ENG-05` | details and status of one feature |
| `sign ENG-13 bestanden "Notiz"` | record a manual result (`bestanden` or `fehlgeschlagen`) |

## Tiers and where the tests live

| Tier | Tool | Runs on | Tests | Feature tag |
|---|---|---|---|---|
| unit | pytest + `FakeMT5` (in-memory broker) | Mac, CI | `worker_python/tests/unit/` | `@pytest.mark.feature("ENG-05")` |
| api | pytest + FastAPI `TestClient`, paths redirected to tmp | Mac, CI | `worker_python/tests/api/` | same |
| e2e | Playwright, production build against a mocked worker | Mac, CI | `frontend_nextjs/e2e/mocked/` | `{ tag: '@ZON-05' }` |
| live | Playwright against the real worker on the VPS | Mac only | `frontend_nextjs/e2e/live/` | same |
| manuell | human sign-off | — | `docs/features/manual_results.yaml` | — |

The e2e mock (`frontend_nextjs/e2e/fixtures/mock-worker.ts`) answers like `worker_python/src/api/*`
and fails a test if a request lacks `X-API-Key` or hits an endpoint the mock doesn't know. When a
worker endpoint changes, update the mock too.

## Running

Always use the runner; it runs the tiers, then regenerates the checklist:

```bash
scripts/features/run.sh                 # unit + api + e2e
scripts/features/run.sh ENG-05          # one feature (or a category: ZON) on unit + api + e2e
scripts/features/run.sh unit ENG-05     # one tier, filtered by ID or category
scripts/features/run.sh e2e ZON
scripts/features/run.sh live            # VPS, read-only
scripts/features/run.sh next | show ID | sign ID STATUS "Notiz" | check | render
```

A tier without matching tests just runs nothing for that filter. Live tests only run when asked
for (`run.sh live ENG-05`). `run.sh show ENG-05` lists a feature's tiers and last results. The
runner needs `worker_python/.venv` with `requirements-dev.txt`; if pyyaml is missing it says so.

Useful extras (inside `frontend_nextjs/`): `npx playwright test --ui` (interactive),
`npx playwright show-trace test-results/<test>/trace.zip` (replay a failure),
`npx playwright codegen http://localhost:3100` (record clicks while writing a new test).

## Live tests and safety (hooks/RULES.md §3)

Live tests use `frontend_nextjs/.env.local` (worker URL + API key) and the DEMO account from
`hooks/test-account.local.md`. Every live test first checks `Tür: DEMO` in that file and
`env_type == DEMO` in the worker, and skips otherwise.

- `run.sh live` (or `npm run test:live`) is read-only: it opens pages and reads the API.
- Trading tests (`e2e/live/trading.spec.ts`: ENG-05, ZON-08, ENG-10 with an appended test zone) run
  only with `E2E_LIVE_DEMO=1`. Bot stop/start (BOT-01/02) also needs `E2E_LIVE_BOT_RESTART=1`.
  **Set these only when the user explicitly asked for trading tests in this conversation.** Tell
  the user what will happen (a test zone with 0.01 lot is appended, settings are restored after)
  before running.
- The trading tests skip themselves when an existing active zone covers the current price.
  Recommend a dedicated DEMO account for tests in that case; never change the user's zones to
  make room.
- Never type passwords, never create or delete accounts on the live worker, never start the worker
  on the Mac. Worker changes are tested live only after the user pulled them on the VPS and
  restarted the worker.

## Reporting

After a run, report in German, briefly:

1. What ran (tiers, filter) and the counts (passed / failed / skipped / known bugs).
2. Each failure by feature ID with the one-line reason from the output. Say whether it looks like
   a real bug or a test problem, and offer to fix real bugs.
3. The checklist count from the runner (`FEATURES.md geschrieben: X/73 abgehakt`).
4. The next open feature (`run.sh next`), and features that only wait for a manual sign-off.

Don't claim a feature passed unless its tests ran in this session. A skipped live test is not a
pass; say why it skipped.

## Manual results

When the user reports a manual check ("ENG-13 bestanden", "UI-03 funktioniert nicht"), record it:

```bash
scripts/features/run.sh sign ENG-13 bestanden "kurze Notiz, was geprüft wurde"
```

Never put credentials, passwords or API keys into notes.

## New or changed features

A feature is not done until it has a catalog entry and a test (hooks/RULES.md §4):

1. Add or update the entry in `docs/features/features.yaml` under the right category, in test
   order. Fields: `id` (next free `KAT-NN`), `titel`, `beschreibung`, `code`, `tiers`, `pruefung`,
   `erwartet`, optional `bekannter_fehler`.
2. Write the tests for the listed tiers and tag them with the ID. Prefer the cheapest tier that
   can prove the behavior: engine logic → unit, endpoint → api, UI flow → e2e.
3. Known bug that is not fixed yet: add `bekannter_fehler` and mark the test
   `@pytest.mark.xfail(strict=True, reason=...)` or `test.fail()` in Playwright. When the bug is
   fixed, remove both.
4. Run `scripts/features/run.sh check`, then the affected tiers, then commit features.yaml,
   the tests, results.json and FEATURES.md together.
