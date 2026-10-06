---
date: 2026-10-06
type: decision
status: open
pr: [103]
features: []
areas: [docs, tooling]
---

# Rules: journal, STE, debugging, reviews, models

## Request

The owner asked to examine these proposals, and to adopt only the parts that help to write better code:

1. A complete project log that a colleague can continue.
2. Write to ASD-STE100. Use a schema instead of text.
3. Do not always use Opus; use other models for simpler work.
4. Never do the work yourself; always delegate to subagents.
5. Examine 8 tools: `obra/superpowers`, `eyaltoledano/claude-task-master`, `oraios/serena`, `yamadashy/repomix`, `karpathy/llm-council`, `diegosouzapw/OmniRoute`, `usestrix/strix`, `garrytan/gstack`. Install nothing without permission.

## Solution

| File | Change |
|---|---|
| `docs/journal/README.md` | When to write an entry, template with front matter, STE rules, privacy, glossary |
| `docs/journal/2026-09-24-…` to `2026-10-02-…` | Four diagnoses and defects, and the Analyse plan, from Claude's private memory |
| `hooks/RULES.md` | §6.5–6.6 (STE for new rules, owner approval for rule changes), §7 journal, §8 debugging and verification, §9 reviews and safety checks |
| `hooks/lib/checks.sh`, `hooks/pre-push` | `check_journal_entry`: a warning when a branch changes code without a journal entry |
| `CLAUDE.md` | Journal, rules and LSP bullets; "Model usage" as a table |
| `.claude/agents/reviewer.md` | The reviewer uses the checklist of §9.1 and §8.2 |
| `repomix.config.json`, `.gitignore` | Review packets for external AI reviews; the output file is ignored |
| `pyrightconfig.json`, `worker_python/typings/MetaTrader5/__init__.pyi` | Pyright for the worker, for the `pyright-lsp` plugin |

Outside the repository (on the Mac of the owner): `typescript-language-server` 6.0.1, `typescript` 5.9.3 and `pyright` 1.1.414 installed with `npm -g`. The global `tsc` changed from 4.8.3 to 5.9.3. `~/.claude/settings.json` got `"model": "opusplan"`.

## Why

Sources for the tool rows: the README and the docs of each repository, read on 2026-10-06. Versions: superpowers v6.4.2, claude-task-master 0.43.1, serena v1.7.0, repomix v1.18.1, OmniRoute v3.8.51, strix v1.7.0, gstack 1.91.27.0; llm-council has no release.

| Proposal | Decision | Reason |
|---|---|---|
| Project log | adopted as `docs/journal/`, one file per entry, no index file | The "why" (causes, failed attempts, plans) was only in private memory and local plan files. One file per entry prevents merge conflicts between parallel PRs. An index file would have the same conflicts. |
| An entry for each step | changed: one entry for each change that adds knowledge | PR descriptions already show the change. An entry for each chat step makes the log too long to read. |
| STE100 | adopted for the journal and new rules | Short, clear sentences help colleagues and AI models. Nobody checks the STE dictionary automatically. |
| Schema instead of text | adopted: front matter, fixed sections, tables | Easy to read quickly and to find with `grep`. Prose only for reasons and lessons. |
| Cheaper models | adopted as a table in `CLAUDE.md`; `opusplan` recommended | Claude Code does not change the model by itself. The main session uses most tokens. `opusplan` uses Opus for plans and Sonnet for the implementation, with the full context. |
| Always delegate | rejected as an absolute rule; delegation table instead | A subagent starts without context: the main session writes a full brief, the agent reads the files again, and the main session examines the result. For small and medium tasks this costs more tokens. A subagent cannot ask the user. |
| superpowers | not installed; principles adopted (§8) | Its session hook forces a skill check before each answer and a long process for each task. It duplicates plan mode, the reviewer, the hooks and the worktrees. |
| claude-task-master | not adopted | A second task list next to `features.yaml`, PRs and this journal. Extra model calls. |
| serena | not installed; native LSP plugins instead | An always-on MCP server with approx. 22 tools, a dashboard and a usage ping. Its edits do not go through Edit/Write, so the post-edit hook does not run. The native `typescript-lsp` and `pyright-lsp` plugins give diagnostics and references with less overhead. |
| repomix | config only; run with `npx` when necessary | Makes the external reviews reproducible and keeps secret files out. The full repository has approx. 790,000 tokens, so the rule requires `--include`. |
| llm-council | not installed; procedure adopted (§9.5) | No maintenance (statement of the author), no license, paid OpenRouter calls, server on 0.0.0.0 without authentication. The procedure (same packet, fixed form, merged list, check against code) is useful. |
| OmniRoute | not installed | Its docs describe how it sends Claude subscription logins through a local proxy and makes the requests look like the official client. This can break the provider terms and put the account at risk. Its security advisories list a critical fix (3.8.49). Adopted from its rules: find names in the code before you write them (§8.5); rule changes need owner approval (§6.6). |
| strix | not installed; `/security-review` instead (§9.2) | Active attacks without a read-only mode; the scope is only a prompt. With the real `.env.local`, it can reach the live worker and the VPS. |
| gstack | not installed; 4 rule sets adopted | 55 skills, global hooks, its own release flow (collides with the version bump). Adopted: stop after 3 failed hypotheses (§8.3), review checklist (§9.1), "localhost acts on the live worker" (§9.3), document check after a change (§9.4). |

## Verification

| Check | Result |
|---|---|
| repomix, small scope (`hooks/`, `docs/journal/`) | 15 files, 18,092 tokens, line numbers, output file ignored by git |
| repomix, full main checkout with real `.env.local`, `test-account.local.md`, `data/`, `logs/`, `configs/` | None of these files in the packet; "No suspicious files detected" |
| Pyright baseline (worker) | before the tuning 153 errors + 28 warnings; after it 35 errors, 0 warnings. The 3 suspected bugs were false alarms (dynamic module in `auto_grid_engine.py`, `dict.get` called twice). |
| Hook `check_journal_entry` (throwaway commits made with `git commit-tree`) | Branch with code and an entry: no warning. Code without an entry: warning. Second push with only docs, or only code: no warning. Full `hooks/pre-push`: warning, exit 0 (does not block). |
| Privacy | `grep` for numbers with 7 or more digits, broker name, IP addresses and ngrok URLs in all new texts: nothing found, only the permitted `127.0.0.1` and `0.0.0.0` |
| Review by the `reviewer` subagent | No critical findings. 5 "should" findings and the useful optional ones are fixed in the same PR. |

## Open points

- [ ] Owner: add the plugins `typescript-lsp` and `pyright-lsp` in the desktop app (**+ → Plugins → Add plugin**, user scope). Then examine in a new session that the diagnostics show after an edit.
- [ ] `"model": "opusplan"` is set in `~/.claude/settings.json` of the owner. Examine in a new session that plan mode uses Opus and the implementation uses Sonnet. If the model picker of the desktop app overrides the setting, select `opusplan` there.
- [x] Remove the MT5 account numbers from tracked files (code comments, tests, docs). Separate PR. The git history keeps them. Done in `2026-10-06-scrub-account-numbers.md`.

## Lessons

- Durable knowledge belongs in the repository, not in a private memory.
- The repository is public. Examine each entry for account numbers, IP addresses and server names before the commit.
- A tool that is popular is not automatically useful here. Compare it with the existing setup first, then adopt only the parts that close a gap.
- Test the hook scripts with `bash`, not in zsh. In zsh, `BASH_SOURCE` is empty, so `ROOT` in `hooks/lib/checks.sh` points to the wrong folder and a test gives a false warning.
