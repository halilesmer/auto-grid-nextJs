# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Grid Robot: an algorithmic grid-trading bot for MetaTrader 5. Monorepo with two packages:

- `frontend_nextjs/` – Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, lightweight-charts
- `worker_python/` – FastAPI worker that talks to MT5 (the `MetaTrader5` package is Windows-only; the worker is meant to run on a Windows host/VPS, often exposed via ngrok)

`docs/proje_dosya_krokisi.md` (Turkish) is the maintained architecture map — read it first before larger changes. Parts are stale (e.g. it mentions `grid_position_sync.py`, which no longer exists), so verify against the code.

`frontend_nextjs/AGENTS.md` (loaded via `frontend_nextjs/CLAUDE.md`) applies to all frontend work: this Next.js version has breaking changes — consult `frontend_nextjs/node_modules/next/dist/docs/` before writing Next.js code.

## Dev setup

Development happens on a MacBook, split across two machines. Detail (VPS bootstrap, the `/vps` page, auto-update, tunnel watchdog, Vercel): `docs/referenz/dev-setup.md`.

- **Mac (local):** the frontend only. `npm run dev:frontend`, http://localhost:3000. `frontend_nextjs/.env.local` points `NEXT_PUBLIC_API_URL` at the worker's ngrok URL.
- **Windows VPS:** the worker only (`worker_python/start.bat`). The worker can't run on the Mac (MT5 is Windows-only), so don't start it locally: `npm run dev` and `npm run dev:backend` aren't meant for this setup. Worker changes can only be checked statically here; they get tested once they're pulled onto the VPS and the worker is restarted.
- **Rights rule:** never run `git` on the VPS as administrator (files would become admin-owned and pulls fail).
- **Vercel:** every PR branch gets a preview deployment. Everything in `NEXT_PUBLIC_*` ends up in the public bundle, so never set secrets such as `NEXT_PUBLIC_WORKER_API_KEY` there. Worker address and API key are entered per browser (`src/store/useConnectionStore.ts`), never build-time env vars.

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

Detail (connection store, API key, multi-user, MT5 passwords): `docs/referenz/commands-baglanti.md`. Hard rules:

- Every worker call uses `axiosInstance` or `getWorkerHeaders()` from `src/lib/api.ts` (never bare `axios`/`fetch`); the WebSocket URL comes from `toWsUrl()` (`src/lib/connectionCode.ts`).
- The worker reads `WORKER_API_KEY`; with it set, every `/api/*` request needs `X-API-Key`. A new account-scoped route gets `dependencies=[Depends(account_access)]`, a new admin-only route `Depends(require_admin)` (`src/api/access.py`, `src/api/auth.py`).
- MT5 passwords never leave the worker: account responses go through `_public_account()` (`src/api/helpers.py`). On `PUT /api/accounts/{id}` an empty password keeps the stored one.

## Tests

Feature catalog `docs/features/features.yaml` → generated checklist `docs/features/FEATURES.md`. Every test carries its feature ID; the `/feature-test` skill (`.claude/skills/feature-test/SKILL.md`) runs the tests and reports. A new or changed feature needs a catalog entry and a tagged test (`hooks/RULES.md` §4). Detail (tiers, tags, live tests, CI): `docs/referenz/tests.md`.

```bash
scripts/features/run.sh              # unit + api + e2e, then regenerate FEATURES.md
scripts/features/run.sh ZON          # one category (or one feature: ENG-05)
scripts/features/run.sh live         # against the VPS worker, DEMO account, read-only
```

- Tag worker tests `@pytest.mark.feature("ENG-05")`, e2e tests `{ tag: '@ZON-05' }`. Stable selectors are `data-testid`/aria attributes.
- Live trading tests only run when the user explicitly asks (`hooks/RULES.md` §3).
- **Before the first push of a PR** run `scripts/features/precheck.sh` (same steps as CI, in CI order; it fails when Playwright ran zero tests). Heavy runs wait for the machine-wide lock (`scripts/features/heavy_lock.sh`).

## Versioning

The GitHub Action `.github/workflows/version-bump.yml` bumps the patch version on every push to `main` (including PR merges): it rewrites `VERSION` and `frontend_nextjs/src/app/version.ts` and pushes a `chore: auto bump version to vX.Y.Z` commit to `main`. Don't edit these two files by hand, and pull `main` after a merge before pushing again. The worker's update check (`src/utils/self_updater.py`) compares the local `VERSION` with `origin/main`. This replaces the former local `.git/hooks/pre-push` hook; don't reinstall it, or versions get bumped twice.

## Architecture

Full map: `docs/referenz/mimari.md` (this repo's Frontend ↔ Worker, state, process model, persistence) and `docs/proje_dosya_krokisi.md`. Hard rules:

- REST under `/api/*` (one FastAPI router per domain in `worker_python/src/api/`), live data over `/ws/stream`. The frontend reads shared data from the Zustand stores in `src/store/` (single source of truth): a hook that fetches shared data must also write it into the store, and a mutation refetches.
- The FastAPI process doesn't trade. One detached bot subprocess per MT5 account (`src/utils/bot_manager.py`); trading loop `bot_runner` → `loop` → `grid_orchestrator`. `grid_orders` is the only MT5 order/position gateway (magic-number based, `src/utils/zone_magic.py`).
- An MT5 read that can download history goes through `mt5_reader.run()` (never in the API process itself).
- `auto_grid_engine.py` is the legacy engine: put new logic in the modular files.
- Persistence (`configs/`, `data/`, `logs/`, paths from `src/utils/paths.py`) is gitignored and may contain credentials.

## Hooks & Kurallar

- `hooks/` klasörü: git `pre-commit`/`pre-push` + Claude Code hook'ları (`.claude/settings.json`). Klonladıktan sonra bir kez: `bash hooks/install.sh`. Detay: `hooks/README.md`.
- Kurallar (GitHub'a yükleme, uyumluluk, test protokolü): `hooks/RULES.md`. Hook hata verirse `--no-verify` ile geçme, hatayı düzelt.
- **"Test et" denince:** önce `hooks/test-account.local.md` dosyasını oku (gitignore'lu demo hesap; şifre içermez), worker'da kayıtlı o hesabı seç, mevcut datayı kullan. Şifre forma yazılmaz. Protokol: `hooks/RULES.md` §3.
- **Branch-Aufräumen:** ein Branch, der über einen gemergten PR (oder direkt) in `main` aufgegangen ist, wird gelöscht (lokal + remote) — nicht als offene Nachfrage stehen lassen. Vor dem Löschen mit `git merge-base --is-ancestor <branch> main` verifizieren, dass er wirklich gemergt ist. Nicht gemergte Branches nur melden, nicht löschen.
- **Merge ohne Rückfrage:** jeder fertige PR wird ohne Frage an Halil mit `gh pr merge <n> --auto --squash --delete-branch` gemergt, nie mit `--admin`. GitHub prüft die Merge-Bereitschaft selbst, die Sitzung prüft beim PR-Öffnen, dass der CI-Monitor der App an ist, und wartet nicht auf „weiter“. Stopp-Bedingungen und Ablauf: `hooks/RULES.md` §1.8.

## Conventions

- **UI ↔ backend sync is mandatory** (from `.agents/rules/token-saver.md`): a new or changed setting/parameter in the worker (engine, config JSON, Pydantic model) is not done until the matching UI field (zone components in `src/components/zone/`, `SettingsForm`, stores, types) reads and writes it correctly.
- **UI strings go through i18n** (`frontend_nextjs/src/i18n`, languages tr/en/de, default `tr`): never hard-code user-visible text. Add the key to the matching area file in `src/i18n/messages/` with all three languages side by side (tsc fails on a missing key), then use `useT()` in components or `t()` outside React (toasts in hooks, stores, `apiError`); use `useFormat()` for numbers/times. Values sent to the worker (e.g. the `clear_*`/`exit_condition` strings in zones) and worker messages (`detail`, log lines) are not translated. In e2e tests take texts from `msg('key')` (`e2e/fixtures/i18n.ts`) instead of literals.
- **Every setting, field and button needs a tooltip** (`hooks/RULES.md` §5): `hint` is a required prop of `InputField`, `Switch`, `Button`, tab items and `ConfirmModal` (tsc fails without it); fields get an (i) icon, buttons a hover/focus tooltip, all via `src/components/ui/tooltip.tsx`. The text is an i18n key `<label-key>.hint` in `src/i18n/messages/hints.ts` (tr/en/de) and says what the control does, its unit/effect and, if it is disabled, why. A plain `<button>`/`<input>` outside `Tooltip`/`InputField` fails the e2e coverage test `UI-07`; no native `title=` for explanations.
- **Design first:** for design or frontend changes (new or changed visible UI), Claude first proposes a design as an Artifact and finishes it together with Halil. Code changes start only after he approves the design.
- Code comments, logs, and docs are mostly in Turkish. Match the language of the file you're editing. Exceptions: the project journal and new rules are in English, to ASD-STE100 (`hooks/RULES.md` §6.5).
- **Library docs:** for questions or code involving Next.js, React, Tailwind, Zustand, lightweight-charts or FastAPI, look up current docs with the Context7 MCP (`.mcp.json`) first. For Next.js also check `frontend_nextjs/node_modules/next/dist/docs/` (see `frontend_nextjs/AGENTS.md`).
- **Project journal** (`docs/journal/`, `hooks/RULES.md` §7): before you change an area, grep the journal for its feature IDs and file names (`grep -l ENG-21 docs/journal/20*.md`) to see earlier causes and lessons. Write an entry for each change that adds knowledge (fix, defect, diagnosis, decision, plan) with the template in `docs/journal/README.md`. The repo is public: no account numbers, server names, IPs. Claude's memory is private to one Mac; durable knowledge and approved plans go into the journal.
- **Debugging, reviews, safety:** `hooks/RULES.md` §8 (root cause first, failing test first, evidence before "done") and §9 (review checklist, `/security-review` for auth/access/VPS changes, `localhost:3000` acts on the live worker, external AI reviews).
- **Code intelligence (LSP):** the Claude Code plugins `typescript-lsp` and `pyright-lsp` (official marketplace) show diagnostics after each edit and give go-to-definition and find-references. Setup on a new machine: `npm i -g typescript-language-server typescript@5 pyright@1.1.414`, then in the desktop app **+ → Plugins → Add plugin** (user scope). Pyright needs `worker_python/.venv` with `requirements-dev.txt` (in a worktree: a symlink to the main checkout's venv). Python uses the root `pyrightconfig.json`: worker only, platform Windows, a `MetaTrader5` stub in `worker_python/typings/`, the noisy `Optional`/argument rules off. The baseline (pyright 1.1.414) has 35 known errors (dynamic legacy module in `bot_runner.py`, the `log` callable signature, test fakes). Fix new diagnostics in the lines you changed; do not fix old ones in an unrelated change.

## Model usage

Claude Code does not change to a cheaper model by itself. Claude does it at phase boundaries (see below). Use these levers:

| Work | Who does it | Model |
|---|---|---|
| Plan, architecture, difficult debugging | main session in plan mode | Opus (`opusplan` selects it automatically) |
| Implementation after an approved plan | main session | Sonnet (`opusplan` changes to it automatically) |
| Routine task (small fix, text, configuration) | main session | Sonnet. On Opus, Claude recommends the change at the start of the task. |
| Broad search across many files, when only the result is necessary | subagent `explorer` (`.claude/agents/explorer.md`) | Haiku |
| Review before commit or PR | subagent `reviewer` (`.claude/agents/reviewer.md`) | Sonnet |
| Small change, or work that needs this conversation | main session | — |

Claude chooses model and `/effort` level itself. The goal is the best result with the fewest tokens: use the lowest model and level that is sufficient for the phase. Before a task with more than one phase, Claude shows this table, one row per phase. Defaults are below. `Reason` names the risk or the routine work of this task in one sentence. At the start of a phase, Claude writes one line that says which model and level the phase needs. The first reply of every session and of every new task starts with this line before any other work. If the session runs on Opus and the phase is not planning, the line is a warning: `**Dikkat:** Opus çalışıyor, bu aşamaya Sonnet/medium yeter — lütfen uygulamadan değiştir.` Claude reads its own model from the system prompt. The session tools `set_session_model` and `set_session_effort` change only other sessions and refuse the own session (checked 2026-10-17). For the own session, the user selects the model and level in the app. It does not change them during a running phase. It raises a level (for example to `xhigh`) only with a reason. For a one-phase task, one line is enough.

| Phase | Model | Level (`/effort`) | Reason |
|---|---|---|---|
| Plan (plan mode) | Opus | high | Design errors are expensive. Use for architecture, security, hard debugging. |
| Implementation after approved plan | Sonnet | medium | Routine work that follows existing patterns: routes, UI, i18n, tooltips, tests. |
| Review before PR (`reviewer`, `/security-review`) | Sonnet | medium | Checklist work. Use `/security-review` for auth, access, VPS changes. |

- Delegate only if the subagent saves more than it costs. A subagent starts without context: the main session writes the brief and examines the result.
- Give the subagent all decisions that it needs (privacy, language, rules). It cannot ask the user.
- The `reviewer` cannot run `git diff`. Give it the diff or the changed files with line ranges, and the purpose.
- Examine each subagent result before you use it. A subagent report is not evidence (`hooks/RULES.md` §8.4).
- Do not change the model during a running phase. Change it only at a phase boundary.
- On Sonnet: for architecture decisions and difficult debugging, change to Opus or a higher `/effort` for the plan phase. Do not guess.

Sessions for plan phases (`start_session`):

- Always set `model` and `effort` from the phase table. Without them, the new session inherits the model and level of the parent session.
- `model` must be the same family or a cheaper model. `effort` must not be higher than the level of the parent session.
- A phase that needs a different model starts as `fresh`. Fork and cloud sessions do not accept `model` and `effort`.
- When one session runs more than one phase, the parent session changes it at each phase boundary with `set_session_model` and `set_session_effort`. The changes apply from the next turn of the child session.
  - The child session writes `PHASENWECHSEL → N` at the start of its recap. Do not change this signal.
  - Before a phase on a more expensive model, the child session waits for the message „Modell umgestellt“ from the parent session.
- The parent session stays open until the last phase switch is done.
- A scheduled task (`create_scheduled_task`) has no `model` parameter. If Claude cannot set the plan model (scheduled task, fork, cloud session, limit error), it tells the user at once.

## Session discipline

Every tool call re-reads the whole session history, so cost grows with session length and with the number of sessions that run at once (measured on the transcripts, 2026-11-04, by start date: the largest session started on 2026-10-06 had 183 model calls and read 55 M cached tokens; the largest started on 2026-10-21 had 130 and read 37 M).

- A step is one planned item that ends in a merged PR or a written result. When a step is finished, Claude does not start the next step in the same session. It writes the state into the journal or the pending list, starts the next step with `start_session` (`initiation: "user_asked"`, `fresh`, brief with files and done criterion), and ends its turn. Auto-fix events and review fixes for the PR of this session stay in this session.
- Approval from the phone: if the app refuses `start_session` after an approval that the user typed in this turn, follow `docs/agent-rules/ajan-kullanimi.md` §10. An idle linked session or this session then does the step.
- At most 5 sessions that write files run at the same time. Before `start_session`, Claude calls `list_sessions` and counts the rows with `isRunning: true` that write. If there are 5, Claude does not start the session; it puts the step in the pending list and says so in one line. Sessions that change the same files, branch or PR do not run in parallel (see `~/.claude/koordinator/ANLEITUNG.md`, „Parallele Untersitzungen“).
- Read-only sessions (search, review) share the checkout and do not count towards the limit.
- Heavy test runs (`precheck.sh`, full e2e, `next build`) operate one at a time on the Mac with the lock `scripts/features/heavy_lock.sh`, not with the session limit (`hooks/RULES.md` §4.12–4.14).
- Write session titles, briefs, recaps and replies in Turkish. Do not translate the signal tokens (`PHASENWECHSEL → N`, `ERGEBNIS:`, `PR:`, „Modell umgestellt“).
