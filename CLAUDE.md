# CLAUDE.md

Guidance for Claude Code in this repository. Each rule has one home; this file holds what every session needs and points to the rest.

## Project

Grid Robot: an algorithmic grid-trading bot for MetaTrader 5. Monorepo with two packages:

- `frontend_nextjs/` – Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Zustand, lightweight-charts
- `worker_python/` – FastAPI worker that talks to MT5 (the `MetaTrader5` package is Windows-only; the worker runs on a Windows VPS, exposed via ngrok)

## Where the rules are

| Read | When |
|---|---|
| `.claude/rules/worker.md` | Before worker work: VPS setup, API key and roles, routes, process model, persistence. Loads by itself for `worker_python/**`. |
| `.claude/rules/frontend.md` | Before frontend work: worker connection, pages, state, i18n, tooltips, design first. Loads by itself for `frontend_nextjs/**`. |
| `.claude/rules/tests.md` | Before you write or change tests: tiers, tags, mock worker, live tests. |
| `hooks/RULES.md` | Push and merge (§1), compatibility (§2), live test protocol (§3), catalog and precheck (§4), tooltips (§5), new rules (§6), journal (§7), debugging (§8), reviews (§9–10). |
| `docs/proje_dosya_krokisi.md` | Architecture map (Turkish). Read it before larger changes; parts are stale, verify against the code. |
| `docs/journal/` | Before you change an area: `grep -l ENG-21 docs/journal/20*.md`. |
| `docs/agent-rules/` | Subagents, Codex scan, weekly limit, coordinator, approval from the phone (`ajan-kullanimi.md`); code rules. |
| `docs/claude-code-setup.md` | LSP plugins and Pyright on a new machine. |

## Dev setup

- **Mac (local):** the frontend only. Run `npm run dev:frontend` and test at http://localhost:3000. `localhost:3000` acts on the live worker on the VPS.
- **Windows VPS:** the worker only. It cannot run on the Mac (MT5 is Windows-only), so do not start it locally: `npm run dev` and `npm run dev:backend` are not for this setup. Check worker changes statically and with the unit/api tests; they are live after the VPS pulled them (auto-update from `origin/main`, default every 5 min).
- **Vercel:** the frontend is deployed publicly; each PR branch gets a preview. Everything in `NEXT_PUBLIC_*` is in the public JS bundle, so never set a secret there.
- Never run `git` on the VPS as administrator.

## Commands

Frontend (inside `frontend_nextjs/`):

```bash
npm run dev:frontend   # Next.js only, http://localhost:3000
npm run build
npm run lint
```

Tests (feature catalog `docs/features/features.yaml` → generated `docs/features/FEATURES.md`; skill `/feature-test`):

```bash
scripts/features/run.sh              # unit + api + e2e, then regenerate FEATURES.md
scripts/features/run.sh ZON          # one category (or one feature: ENG-05)
scripts/features/run.sh unit ENG-05  # one tier + filter
scripts/features/run.sh live         # against the VPS worker, DEMO account, read-only
scripts/features/run.sh next | show ID | sign ID bestanden "Notiz"
scripts/features/precheck.sh         # before the first push of a PR: the CI steps in CI order
```

- A new or changed feature needs a catalog entry and a tagged test (`hooks/RULES.md` §4).
- Heavy runs (`precheck.sh`, full e2e, `next build`) operate one at a time on the Mac; the scripts take the lock themselves. Run them in the background.
- CI (`.github/workflows/tests.yml`) runs the catalog check, worker tests, and frontend lint + tsc + e2e on every PR and push to `main`.

## Hard rules

- **Versioning:** do not edit `VERSION` or `frontend_nextjs/src/app/version.ts`. A GitHub Action bumps them on every push to `main`. Pull `main` after a merge before you push again. Do not reinstall the old local `pre-push` version hook.
- **Secrets:** the repository is public. No account numbers, server names, IPs, passwords or keys in code, logs, commits or the journal. MT5 passwords never leave the worker.
- **UI ↔ backend sync:** a new or changed worker setting (engine, config JSON, Pydantic model) is not done until the matching UI field reads and writes it (`hooks/RULES.md` §2.1).
- **UI text and tooltips:** every user-visible text goes through i18n (tr/en/de); every setting, field and button has a `hint` (`hooks/RULES.md` §5, `.claude/rules/frontend.md`).
- **Design first:** for new or changed visible UI, Claude first proposes a design as an Artifact and finishes it with Halil. Code starts after he approves the design.
- **Hooks:** after a clone, run `bash hooks/install.sh` once. When a hook fails, repair the cause; do not use `--no-verify`.
- **"Test et":** read `hooks/test-account.local.md` first, select that DEMO account in the worker, use the existing data. Do not type a password into a form (`hooks/RULES.md` §3).
- **Merge without a question:** each finished PR is merged with `gh pr merge <n> --auto --squash --delete-branch`, never `--admin`. Stop conditions and procedure: `hooks/RULES.md` §1.8.
- **Branch cleanup:** delete a merged branch (local and remote) after you verified the merge. With squash merges, compare the trees, not the ancestry. Report branches that are not merged; do not delete them.
- **Evidence:** root cause first, failing test first, no "done" without the command and its result from this session (`hooks/RULES.md` §8). Run `/security-review` for auth, access and VPS changes (§9).
- **Journal:** write an entry in `docs/journal/` for each change that adds knowledge (fix, defect, diagnosis, decision, plan). Claude's memory is private to one Mac; durable knowledge and approved plans go into the journal.
- **Rule files** (`CLAUDE.md`, `.claude/`, `hooks/`, `docs/agent-rules/`) change only when Halil asks (`hooks/RULES.md` §6).
- **Language:** code comments, logs and docs are mostly Turkish; match the file. The journal and new rules are English (ASD-STE100).
- **Library docs:** for Next.js, React, Tailwind, Zustand, lightweight-charts or FastAPI, look up current docs with the Context7 MCP first.
- **Legacy:** `auto_grid_engine.py` is the old monolithic engine. Put new logic in the modular files.
- **LSP:** fix new diagnostics in the lines you changed; do not fix the 35 known Pyright errors in an unrelated change.

## Model usage

The goal is the best result with the fewest tokens: the lowest model and `/effort` level that is sufficient for the phase.

| Phase | Model | Level | Reason |
|---|---|---|---|
| Plan, architecture, security, hard debugging | Opus | high | Design errors are expensive. |
| Implementation after an approved plan; routine task | Sonnet | medium | Work that follows existing patterns: routes, UI, i18n, tooltips, tests. |
| Review before PR (`reviewer`, `/security-review`) | Sonnet | medium | Checklist work. |
| Broad search, when only the result is necessary | subagent `explorer` | Haiku | Keeps file dumps out of the main session. |

- The first reply of each session and of each new task starts with one line: the phase and the model and level it needs. Before a task with more than one phase, Claude shows the table with one row per phase.
- Claude reads its own model from the system prompt and cannot change it. If the session runs on a more expensive model than the phase needs, the line is a warning: `**Dikkat:** <model> çalışıyor, bu aşamaya <model>/<level> yeter — lütfen uygulamadan değiştir.`
- Change model and level only at a phase boundary. Raise a level only with a reason.
- Subagents: delegate only if the subagent saves more than it costs. It starts without context, so the brief holds each decision it needs (privacy, language, rules). The `reviewer` cannot run `git diff`: give it the diff or the changed files with line ranges, the purpose and the done criterion. A subagent report is not evidence; examine it before you use it.
- Sessions for plan phases (`start_session`): always set `model` and `effort` from the table (same family or cheaper; `effort` not higher than the parent). A phase that needs a different model starts as `fresh`; fork and cloud sessions do not accept `model` and `effort`. When one child session runs more than one phase, it writes `PHASENWECHSEL → N` at the start of its recap and waits for „Modell umgestellt“ before a more expensive phase; the parent changes it with `set_session_model` and `set_session_effort` and stays open until the last switch.
- If Claude cannot set the plan model (scheduled task, fork, cloud session, limit error), it tells the user at once.

## Session discipline

Every tool call reads the whole session history again, so cost grows with session length and with the number of parallel sessions.

- A step is one planned item that ends in a merged PR or a written result. When a step is finished, Claude does not start the next step in the same session. It writes the state into the journal or the pending list, starts the next step with `start_session` (`initiation: "user_asked"`, `fresh`, brief with files and done criterion), and ends its turn. Auto-fix events and review fixes for the PR of this session stay in this session.
- If the app refuses `start_session` after an approval that the user typed in this turn, follow `docs/agent-rules/ajan-kullanimi.md` §10.
- At most 5 sessions that write files run at the same time. Before `start_session`, count the writing rows with `isRunning: true` in `list_sessions`. At 5, put the step in the pending list and say so in one line. Sessions that change the same files, branch or PR do not run in parallel.
- Read-only sessions (search, review) share the checkout and do not count.
- Session titles, briefs, recaps and replies are Turkish. Do not translate the signal tokens (`PHASENWECHSEL → N`, `ERGEBNIS:`, `PR:`, „Modell umgestellt“).
