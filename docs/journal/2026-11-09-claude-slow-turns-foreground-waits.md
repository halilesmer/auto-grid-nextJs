---
date: 2026-11-09
author: Claude
type: diagnosis
status: done
pr: []
features: [SYS-14, SYS-11]
areas: [tooling]
---

# Slow Claude turns: effort and foreground waits

## Request
The owner said: during the last 3–4 days, Claude became much slower. Find the cause.

## Cause
Measured from the Claude Code transcripts of this project (715 files, 28,580 model calls, 2026-10-27 to 2026-11-09).

| Measurement | Result |
|---|---|
| Time per model call | No change. Median 4–5 s, approx. 110 output tokens/s, first block approx. 3 s. |
| Client time between tool result and next request | No change. Median 0.03 s. Stop hook median 0.2–0.4 s. |
| Effort of the turns of the owner | Opus/xhigh: 28 % (11-05), 65 % (11-07), 91 % (11-08). Main sessions start with the effort that the app picker remembers. Child sessions get the effort that `start_session` sets (mostly Sonnet/medium). |
| Opus/xhigh turn compared to Sonnet/medium turn (median) | First text 29 s / 12 s. Turn 200 s / 22 s. 11 / 4 model calls. 9,200 / 1,700 output tokens. Part of the difference comes from harder tasks. |
| Foreground wait loops | `until grep -q FINISHED …; do sleep 10; done` held sessions until the 590 s tool timeout. Non-test Bash calls longer than 60 s: 13–64 per day before, 160 on 11-08. One session had 34 loops (211 min) on 11-08. |
| Heavy lock queue (SYS-11) | Total wait 561 min on 11-06 (one wait of 299 min). Queue position up to 8 on 11-08. |

## Solution
| File | Change |
|---|---|
| `hooks/claude/pre-bash-wait.sh` | New PreToolUse hook. It stops a foreground `until`/`while` loop with `sleep`, and a `sleep` of 60 s or more. Background commands and `timeout N` (N ≤ 120) are permitted. |
| `.claude/settings.json` | Registers the hook for `Bash`. |
| `hooks/RULES.md` §4.15, `hooks/README.md` | Rule and hook table. |
| `e2e/mocked/wait-hook-lib.spec.ts` | Tests for blocked and permitted commands (SYS-14). |

## Why
A foreground wait gives no result that a background run with a notification does not give. But it blocks the session, and the messages of the user wait. A hook stops the pattern before it runs, so the rule does not depend on memory.

## Verification
The hook script was run with 13 sample commands; the e2e test covers them. See the PR for the test results.

## Open points
- The effort picker in the app is the owner's setting (Sonnet/medium for implementation, Opus/high for plans, CLAUDE.md "Model usage").
- The heavy lock queue stays long when many sessions run full e2e runs. A decision about fewer local full runs is open (1109-A1.3).

## Lessons
When Claude seems slow, measure per call and per turn separately. The transcripts contain `api-request` lines (send time, model, effort) and assistant lines (end time, tokens).
