# Agent rules

Copy of the owner's global rules for coding agents. The source folder `~/.claude/rules/` was removed on 2026-11-03; a snapshot is in `~/.claude/backups/rules-2026-11-03/`. This copy is now the live version. Other agents (Codex) read it through the root `AGENTS.md`.

| File | Topic | Applies to |
|---|---|---|
| `calisma-disiplini.md` | Evidence, no weakened checks, surgical changes, secrets | all work |
| `communication-style.md` | Reply structure, focus line, backlog, decision log | all replies |
| `ajan-kullanimi.md` | Subagents: cost estimate first, max. 5 agents; Codex: final read-only bug hunt only | multi-agent work, final check |
| `dogruluk.md` | Types, error handling | code files |
| `mimari.md` | Dependency direction, boundary checks | code files |
| `okunabilirlik.md` | Call sites, comments, names, flow | code files |
| `tasarim.md` | No speculative code, abstractions, tidy first | code files |
| `test.md` | See red first, observed results, stable tests | test files |

Project rules (`CLAUDE.md`, `hooks/RULES.md`) take precedence where they are more specific.

Edit this copy directly; there is no source to refresh it from. No hook checks this copy.
