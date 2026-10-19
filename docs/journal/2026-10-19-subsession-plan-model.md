---
date: 2026-10-19
author: Claude
type: decision
status: done
pr: []
features: []
areas: [tooling, docs]
---

# Sessions for plan phases get the plan model

## Request
Make the rule permanent in `CLAUDE.md`: a session that Claude starts for a plan phase gets the model and level of that phase.

## Cause
Two sessions ran on the wrong model. A live-test session ran on Sonnet/high and not Sonnet/medium. A restarted session ran on Opus and not Sonnet. `start_session` without `model` and `effort` inherits both from the parent session (Opus/xhigh).

## Solution
| File | Change |
|---|---|
| `CLAUDE.md` | New list "Sessions for plan phases" in "Model usage" |

## Why
- Decision of the project owner, 2026-10-19: Claude sets `model` and `effort` at `start_session`, and changes them at phase boundaries.
- `set_session_model` and `set_session_effort` refuse the own session and apply from the next turn. Therefore the parent session switches the child session, and the child session signals the boundary with `PHASENWECHSEL → N`.
- Fork and cloud sessions do not accept `model` and `effort`. A phase with another model starts as `fresh`.
- The rule is in `CLAUDE.md` because the model choice is a project rule (`ajan-kullanimi.md` §4). Rejected: the global rule file. The tools and the phase table are specific to this project.

## Verification
Not verified in a live run. The tool limits come from the tool descriptions, not from a test.

## Lessons
Set `model` and `effort` at every `start_session` from a plan. Do not trust inheritance.
