---
date: 2026-10-11
author: Codex
type: decision
status: done
pr: []
features: []
areas: [docs, tooling]
---

# Keep useful Ponytail rules in the project

## Request

- Research Ponytail and adopt useful prompts when installation is unnecessary.
- Store the selected instructions in the project rules for future sessions.

## Solution

| File | Change |
|---|---|
| `hooks/RULES.md` | Add section 10 for implementation scope, reuse, review evidence and audit boundaries. |

## Why

Ponytail supplies prompts for implementation, reviews and audits. The project already covers many of its implementation rules.
The selected additions strengthen review evidence and checks of affected code. They do not replace existing safety or test requirements.
Both Claude Code and Codex read `hooks/RULES.md`. A shared section makes the instructions available in future project sessions.
The plugin is unnecessary for these instructions. No plugin, lifecycle hook or new dependency was installed.

| Source | Use |
|---|---|
| [Implementation prompt](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md) | Scope, reuse order and readable complete changes. |
| [Review prompt](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail-review/SKILL.md) | Connected code, expected load, concrete triggers and consequences. |
| [Audit prompt](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail-audit/SKILL.md) | Requested scope, data flow and deletion evidence. |

## Verification

| Check | Result |
|---|---|
| Existing rules and journal decisions | Read before editing; repeated implementation rules remain in their existing files. |
| `git diff --check` | Exit 0; no whitespace errors. |
| `bash scripts/features/run.sh check` | Exit 0; `features.yaml ok (157 Features)`. Used the existing worker test environment. |
| Manual review against `hooks/RULES.md` section 9 | No code, API, bot state or access changes. The shared instructions preserve existing checks. |
| Code and feature changes | None. No feature catalog entry or tagged test is required. |
| Runtime behavior | Not verified; this change contains instructions only. |

## Lessons

Store adopted working instructions in the shared project rules. A statement in one chat does not persist them for future sessions.
