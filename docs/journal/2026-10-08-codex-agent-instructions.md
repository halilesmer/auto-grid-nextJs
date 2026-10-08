---
date: 2026-10-08
author: Claude
type: decision
status: done
pr: []
features: []
areas: [tooling]
---

# Add AGENTS.md for Codex

## Request
The owner will also develop the project with OpenAI Codex. Codex must work with the same rules, skills and tools as Claude Code.

## Solution
| File | Change |
|---|---|
| `AGENTS.md` | New. Reading order, hard rules, Codex setup (Context7 MCP), table of Claude features and Codex replacements. |
| `docs/agent-rules/` | New. Copy of the owner's global rules from `~/.claude/rules/`, with a README index. |

## Why
Codex reads `AGENTS.md` automatically. It points to `CLAUDE.md` and `hooks/RULES.md` instead of repeating them, so there is one source per rule. The global rules lived only on the owner's Mac; the owner approved a public copy. Cost: the copy can go out of date; the README gives the refresh command.
