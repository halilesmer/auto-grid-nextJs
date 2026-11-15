---
date: 2026-11-15
author: Claude
type: decision
status: open
pr: [544]
features: []
areas: [rules]
---

# Rule files: one home for each rule

## Request
The owner asked for a review of all Claude rule files and a shorter, current `CLAUDE.md`.

## Solution

| File | Change |
|---|---|
| `CLAUDE.md` | From 168 lines (30 KB) to 102 lines (9.7 KB). Holds project, setup, commands, hard rules, model table, session discipline and a table "where the rules are". |
| `.claude/rules/worker.md`, `frontend.md`, `tests.md` | New. They hold the detail that was in `CLAUDE.md` (VPS setup, API key and roles, routes, process model, persistence, pages, state, UI rules, test tiers). Each file has a `paths:` header. |
| `docs/claude-code-setup.md` | New. LSP setup for a new machine. |
| `hooks/RULES.md` | §1.8 names the `pr-izleyici` mod. §2.1 is the home of the UI ↔ backend rule. §6.7 corrected. §6.8 added: each rule has one home. |
| `.agents/rules/token-saver.md` | Deleted. It came from a different tool and its rule "do not read files that are not marked with @" was in conflict with all other rules. |
| `docs/agent-rules/communication-style.md` | From 148 to 39 lines. The fixed reply lines, the backlog layout, the decision log format and the session-end line are removed. |

## Why
The review found the same rule in up to four files, and the copies did not agree (archive rule, merge notice, source of the global rules). `CLAUDE.md` is read in each session, so its size is a cost for each tool call. The owner's global file was shortened on 2026-10-09 because fixed reply forms did not help; `communication-style.md` still required those forms.

Rejected: move the architecture text into `docs/proje_dosya_krokisi.md`. That file is Turkish and partly stale; a second copy of the facts would start there.

## Verification
- Of 328 backtick terms in the old `CLAUDE.md`, 17 are not in the new files. Each one was removed on purpose (for example `opusplan`, `token-saver.md`, the note on `grid_position_sync.py`).
- `bash -n hooks/lib/checks.sh` passes.
- Not verified: that Claude Code loads the `.claude/rules` files only for the paths in their header. If it does not, no rule is lost: the table in `CLAUDE.md` tells the session to read them.
- `scripts/features/precheck.sh` was not run: the change touches documents and one message string in `hooks/lib/checks.sh`. CI runs the full check on the PR.

## Open points
- [ ] Start a new session, work in `worker_python/`, and check that `.claude/rules/worker.md` is in the context.
- [ ] The model table has no row for models above Opus. The owner decides the phase for them.

## Lessons
When a rule changes, change its home and nothing else. A copy in a second file is the start of the next conflict.
