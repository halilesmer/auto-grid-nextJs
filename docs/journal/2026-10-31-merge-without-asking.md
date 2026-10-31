---
date: 2026-10-31
author: Claude
type: decision
status: done
pr: [256]
features: []
areas: [tooling]
---

# Claude merges PRs without a question

## Request
The owner does not want a question after green CI. Claude must merge each PR automatically.

## Solution

| File | Change |
|---|---|
| `.claude/settings.json` | `gh pr merge` moved from `ask` to `allow`. `deny` blocks `--admin`. |
| `hooks/RULES.md` §1.8 | New rule: the merge command and the conditions that stop a merge. |
| `hooks/RULES.md` §6.6 | Rule files change only when the owner asks. These PRs follow §1.8. |
| `CLAUDE.md` | One line with the command. All sessions load this file. |

## Why
A text rule alone was not sufficient. PR #237 set `gh pr merge` to `ask`, and `ask` has priority over `allow`. Thus the app asked the owner for each merge. PR #237 protected against a child session that merges when its brief does not contain "NICHT MERGEN". The owner now accepts this risk. The brief keeps the line, because the coordinator does the checks before the merge.

The command uses `--auto`, because the ruleset "main: CI muss grün sein" holds the merge until the required checks pass. This needs no polling.

The `deny` entry is necessary, because the ruleset lets admins bypass it (`bypass_mode: always`). Without `--auto`, a merge with `--admin` can go past a failed check.

Rejected: a global rule in `~/.claude/rules/`. Other repositories can have no required checks. There, `--auto` gives no protection.

## Follow-up: no "weiter" after the merge command
The owner does not want to write "weiter" so that a session examines the PR. `--auto` already makes GitHub do the readiness check. The missing part was the way back to the session.

| Case | Who acts |
|---|---|
| Required checks pass | GitHub merges. The app gives no event, so the DEMO test points go in the same turn as the merge command. The next turn or session updates `main`. |
| A check fails, a conflict occurs, or a review comment arrives | The CI monitor of the app (`set_monitor`, `auto_fix: true`) wakes the session. The session removes the cause and pushes. |

Rejected: polling with `gh pr checks --watch`, `ScheduleWakeup` or cron. The instructions of the app forbid it, and the monitor does the same work with no model calls.

Accepted cost: `set_monitor` can show an approval card for each PR. The app setting `auto_archive_on_pr_close` is on, so a merge archives the session. Thus no session is left to update `main` after a green merge.

## Verification
| Check | Result |
|---|---|
| `gh pr merge 999999 --admin` | Claude Code refused the command (`deny`). |
| The PR of this change | It is the first merge with the rule. |

## Lessons
Before you write a rule about a question from the app, find the permission that causes the question. Search `.claude/settings.json` first.

Accepted cost: the worker on the VPS updates from `origin/main` in approx. 5 minutes (`src/utils/auto_updater.py`). A merge reaches the live worker, and no person examines it first. Only CI, the `reviewer` and Codex stop a defect.
