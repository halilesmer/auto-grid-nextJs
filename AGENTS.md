# AGENTS.md

Instructions for coding agents other than Claude Code (for example OpenAI Codex). Claude Code reads `CLAUDE.md`. This file makes other agents work with the same rules.

## Read first, in this order

1. `CLAUDE.md`: project, dev setup (Mac frontend, Windows VPS worker), commands, tests, versioning, architecture, conventions. All of it applies to you. The "Model usage" section is Claude-specific; skip it.
2. `hooks/RULES.md`: rules for commits, push, compatibility, test protocol, tooltips, journal, debugging and reviews.
3. `docs/agent-rules/`: the owner's general working rules (Turkish), same as Claude uses. Start with `README.md` there.
4. `frontend_nextjs/AGENTS.md`: before any frontend work. This Next.js version has breaking changes; read `frontend_nextjs/node_modules/next/dist/docs/`.
5. `docs/journal/`: before you change an area, grep it for the feature IDs and file names (`grep -l ENG-21 docs/journal/20*.md`).

## Hard rules (short form; the files above are the source)

- Do not start the Python worker on the Mac. MT5 runs on Windows only. Check worker changes with the unit/api tests.
- Every worker call from the frontend goes through `axiosInstance` or `getWorkerHeaders()` (`src/lib/api.ts`).
- UI text goes through i18n (tr/en/de). Every field and button needs a `hint` tooltip.
- A worker setting is not done until the matching UI field reads and writes it.
- A new or changed feature needs an entry in `docs/features/features.yaml` and a tagged test.
- Do not edit `VERSION` or `frontend_nextjs/src/app/version.ts`. CI bumps them.
- The repo is public. No account numbers, server names, IPs, passwords or keys in code, logs, commits or the journal. Do not read or print `.env*` values.
- Do not skip, delete or weaken a failing test, lint or type check. Do not use `--no-verify`.
- A claim such as "done" or "tests pass" needs the command and its output from this session.
- Write a journal entry (`docs/journal/README.md` template, `author: Codex`) for each change that adds knowledge.
- Work on a branch and open a PR to `main`. After a merge, pull `main` (version bump commit) and delete the merged branch.

## Setup in Codex

- Run `bash hooks/install.sh` once after clone (git hooks).
- Frontend: `cd frontend_nextjs && npm ci`. Worker tests: `cd worker_python && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt`.
- Library docs: add the Context7 MCP server to `~/.codex/config.toml`:

  ```toml
  [mcp_servers.context7]
  command = "npx"
  args = ["-y", "@upstash/context7-mcp@latest"]
  ```

  Use it for Next.js, React, Tailwind, Zustand, lightweight-charts and FastAPI before you write code against them.

## Claude features and their Codex replacement

| Claude Code | In Codex |
|---|---|
| Skill `/feature-test` | Read `.claude/skills/feature-test/SKILL.md` and follow it; runner is `scripts/features/run.sh`. |
| Skill `ui-design` | Read `.claude/skills/ui-design/SKILL.md` before any visible UI change. |
| Subagents `explorer`, `reviewer` (`.claude/agents/`) | Do the search yourself. Before a PR, review your diff against the checklist in `hooks/RULES.md` §9. |
| `/security-review` | For auth, access or VPS changes, do a manual security review of the diff and write the result in the PR. |
| LSP plugins (TypeScript, Pyright) | Run `npm run lint`, `npx tsc --noEmit` and `pyright` (root `pyrightconfig.json`). |
| Claude hooks (`.claude/settings.json`) | Not active in Codex. The git hooks from `hooks/install.sh` still run. |
| Claude memory | Not shared. Durable knowledge is in `docs/journal/`. |

## Plan format: phases, model, effort

Before a task with more than one phase, show this table in the chat and wait for approval. One row for each phase. For a one-phase task, one line is enough.

| Column | Content |
|---|---|
| Phase | Name of the phase. Put the files or areas you read or change in brackets. |
| Model | The lowest model that is sufficient for the phase. |
| Effort | The lowest reasoning effort that is sufficient. Use the highest level only with a reason. |
| Reason | One sentence: the risk of this task, or why the work is routine. |

Default phases:

| Phase | Model | Effort | When |
|---|---|---|---|
| Plan: read the code, decide the design | Strongest model | high | Architecture, security, difficult debugging. A design error is expensive. |
| Implementation after the approved plan | Mid-size model | medium | Routine work that follows existing patterns: routes, UI, i18n, tooltips, tests, catalog, journal. |
| Review before commit or PR: your diff against `hooks/RULES.md` §9 | Mid-size model | medium | Checklist work. Auth, access or VPS changes also need the manual security review (see the table above). |

- Change model and effort only at a phase boundary, never in a running phase. Say in one line what you change.
- Use the model names that your Codex configuration offers. Do not invent names.
- Example row: `Plan (read the runner, the worker, the zone button, the catalog) | strongest | high | The architecture decides how the results bind to the account.`

## Communication

The owner writes German or Turkish. Answer in the language of the message. Follow `docs/agent-rules/communication-style.md`: result first, one decision per reply, name assumptions.
