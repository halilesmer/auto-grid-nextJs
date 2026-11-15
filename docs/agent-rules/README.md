# Agent rules

The owner's general working rules for coding agents. They started as a copy of `~/.claude/rules/` (snapshot of 2026-11-03 in `~/.claude/backups/rules-2026-11-03/`) and are edited here since then. Claude Code reads `~/.claude/CLAUDE.md` and `~/.claude/rules/` in each session; those files win where they differ from this folder. Other agents (Codex) read this folder through the root `AGENTS.md`.

| File | Topic | Applies to |
|---|---|---|
| `calisma-disiplini.md` | Evidence, no weakened checks, surgical changes, secrets | all work |
| `communication-style.md` | Priority of the request, scope, shared terms, result first | all replies |
| `ajan-kullanimi.md` | Subagents: cost estimate first, max. 5 agents; Codex: final read-only bug hunt only | multi-agent work, final check |
| `dogruluk.md` | Types, error handling | code files |
| `mimari.md` | Dependency direction, boundary checks | code files |
| `okunabilirlik.md` | Call sites, comments, names, flow | code files |
| `tasarim.md` | No speculative code, abstractions, tidy first | code files |
| `test.md` | See red first, observed results, stable tests | test files |

Project rules (`CLAUDE.md`, `hooks/RULES.md`) take precedence where they are more specific.

Edit these files directly. No hook checks them.
