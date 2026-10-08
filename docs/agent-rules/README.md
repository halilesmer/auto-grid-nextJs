# Agent rules

Copy of the owner's global rules for coding agents (source: `~/.claude/rules/` on the owner's Mac). Claude Code loads the source; other agents (Codex) read this copy through the root `AGENTS.md`.

| File | Topic | Applies to |
|---|---|---|
| `calisma-disiplini.md` | Evidence, no weakened checks, surgical changes, secrets | all work |
| `communication-style.md` | Reply structure, focus line, backlog, decision log | all replies |
| `ajan-kullanimi.md` | Subagents: cost estimate first, max. 5 agents | multi-agent work |
| `dogruluk.md` | Types, error handling | code files |
| `mimari.md` | Dependency direction, boundary checks | code files |
| `okunabilirlik.md` | Call sites, comments, names, flow | code files |
| `tasarim.md` | No speculative code, abstractions, tidy first | code files |
| `test.md` | See red first, observed results, stable tests | test files |

Project rules (`CLAUDE.md`, `hooks/RULES.md`) take precedence where they are more specific.

The copy can go out of date. To refresh it on the Mac: `cp ~/.claude/rules/*.md docs/agent-rules/` (keep this README).
