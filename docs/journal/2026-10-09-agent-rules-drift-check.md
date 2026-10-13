---
date: 2026-10-09
author: Claude
type: decision
status: done
pr: [160]
features: []
areas: [tooling]
---

# Warn when the agent rules copy drifts from the source

## Request
The gap between the owner's global rules (`~/.claude/rules/`, Mac only) and the public copy in `docs/agent-rules/` (read by Codex through `AGENTS.md`) was open: a change on the Mac would not reach the copy without anyone noticing. The owner asked to close it.

## Solution
| File | Change |
|---|---|
| `hooks/lib/checks.sh` | New `check_agent_rules_copy`: compares each `~/.claude/rules/*.md` with `docs/agent-rules/`. Warns on difference or missing file. Silent when the source does not exist. |
| `hooks/pre-push` | Calls the check (step 6). Warning only, does not block. |
| `hooks/README.md` | Lists the check in the pre-push row. |
| `hooks/RULES.md` | New rule §6.7, tag `[otomatik-uyarı]` (procedure §6.1). |
| `docs/agent-rules/README.md` | Refers to the warning next to the refresh command. |

## Why
The copy is kept by hand. A warning at push time catches drift at the moment it could be fixed, and it is cheap (no network, no build). It does not block, because a Mac-only source is not a code error. A source file missing from the copy also counts as drift, so new global rules are caught.

Rejected: a symlink from `~/.claude/rules/` into the repo. It removes drift, but it changes the owner's global Claude setup. Rejected: a blocking check. The source exists on one machine only, so a block would stop work on other machines.

Limit: the check cannot see whether Codex actually follows the rules. Only the git hooks and CI run for Codex; Claude Code hooks do not.

## Verification
| Check | Result |
|---|---|
| 2026-10-09, real source, identical copy | `✓ Agent kuralları kopyası kaynakla aynı`, exit 0. |
| 2026-10-09, source with an appended line in `test.md` | `! … kaynaktan sapmış … test.md`, exit 0 (warning only). |
| 2026-10-09, source directory absent | No output, exit 0. |
| 2026-10-13, review before the PR | The change was left uncommitted in an old worktree. Its base is in `main`; `checks.sh`, `pre-push` and `hooks/README.md` did not change in `main` since then (`git log c45720d..origin/main` on these files: 0 commits). The patch applied without conflict on `bf88f4c`. |
| 2026-10-13, four cases with a temporary `HOME` copy of the real rules | Identical: `✓`, exit 0, 0 warnings. Changed `test.md`: warning names `test.md`, exit 0. New source file `neu.md`: warning names `neu.md`, exit 0. No source folder: no output, exit 0. |
| 2026-10-13, real source against `main` | All 8 rule files identical. |
| `bash -n` on `checks.sh` and `pre-push` | No syntax errors. |
| 2026-10-13, full new `hooks/pre-push` with a simulated new-branch push line | `✓ Agent kuralları kopyası kaynakla aynı`, exit 0. The worktree's `core.hooksPath` points to the main checkout, so the real push ran the old hooks. |
| Warning count | One drift adds 2 to the warning count (message and hint line). Lines 184 and 234 of `checks.sh` use the same pattern. Not changed. |
