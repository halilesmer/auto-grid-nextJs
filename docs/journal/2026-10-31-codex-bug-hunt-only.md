---
date: 2026-10-31
author: Claude
type: decision
status: done
pr: []
features: []
areas: [tooling]
---

# Codex does only the final bug hunt

## Request
The owner cancelled the rule that gives implementation work to Codex. Claude plans and writes all code. Codex does a thorough bug hunt at the end.

## Solution
| File | Change |
|---|---|
| `~/.claude/rules/ajan-kullanimi.md` | §7 now describes the final read-only bug hunt. §8 keeps the limit check, the 5 % stop and the cost estimate. The handoff to Codex is removed. |
| `docs/agent-rules/` | Copy refreshed with the documented command. The README row names the Codex role. This also closes an older 1-line difference in `calisma-disiplini.md`. |
| `AGENTS.md` | New section "Role of Codex in this project". The other sections stay for an agent that gets implementation work from the owner. |
| `.gitignore` | `docs/codex/` is ignored. It holds prompts and reports, and the repo is public. |

Decisions in the new rule:

| Topic | Decision |
|---|---|
| Time | One run when the code is complete and Claude's own checks are green, before the PR. No run for text, documentation or configuration changes. |
| Rights | `codex exec -s read-only`. The report comes from `-o`, because the sandbox stops Codex from writing files. |
| Model | `gpt-6.1-sol` with `xhigh`. The auditor role in §4 uses this effort. |
| Findings | Claude examines each finding against the code, and corrects confirmed findings. A failing test comes first. |
| Rounds | One round. A second run is only for a correction that changes the design. |
| No Codex quota | The bug hunt does not run, the PR continues, and the reply says so. |

## Why
One author for the plan and the code prevents loss of context. A second model that did not write the code finds errors that the author does not see.

Rejected: Codex takes open work when Claude's weekly limit is nearly empty (old §8). That is implementation work, which the owner cancelled. Claude writes the state and continues after the reset.

Rejected: a bug hunt after each commit. The owner asked for it at the end, and a run costs Codex quota.

## Verification
| Check | Result |
|---|---|
| 2026-10-31, `codex exec -s read-only -m gpt-6.1-sol -c model_reasoning_effort=xhigh -o docs/codex/smoke-rapor.md` with a small test prompt, codex-cli 0.162.0 | The session header shows `sandbox: read-only`, `reasoning effort: xhigh`. |
| Same run, write attempt in the sandbox | `operation not permitted: docs/codex/write-test.txt`. |
| Same run, `git diff --stat origin/main` in the sandbox | Worked: `5 files changed, 58 insertions(+), 1 deletion(-)`. |
| Same run, report | `docs/codex/smoke-rapor.md` was written and `git check-ignore` matches it. |
| `-C <worktree>` | Not verified in this run. The test ran from the worktree as current folder. The option is the same one the old rule used. |
| Running tests inside the sandbox | Not verified. Claude's own checks run before the bug hunt, so the bug hunt does not need them. |

## Open points
- [ ] Measure the Codex quota for a real bug hunt with `xhigh`. The cost of a full branch run is unknown.

## Lessons
Global rule files load at session start. A rule change does not reach running sessions, so tell them.
