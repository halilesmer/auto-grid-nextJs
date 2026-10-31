---
date: 2026-10-31
author: Claude
type: decision
status: open
pr: [267]
features: []
areas: [tooling]
---

# Approvals from the phone

## Request
The owner wants to give all approvals on the phone. The owner cannot start the next step of a plan from there.

## Cause
The desktop app refuses `start_session` on a message that comes through Remote Control. The app also refuses it on a turn that a mod started. The coordinator does not do the work. Thus an approval from the phone stops at the start of the next session. This cause is derived from the refusal text. The owner's own case is not verified.

A test on 2026-10-31 used a card with `initiation: "own_initiative"`. The owner could not start the card on the phone. The test does not show if the card was missing or if the tap failed.

## Solution

| File | Change |
|---|---|
| `~/.claude/rules/ajan-kullanimi.md` §10 | New rule. Each approval question is in the message text, and a typed `ja` is sufficient. |
| `docs/agent-rules/ajan-kullanimi.md` | Copy refreshed. The copy also gets §9, which was missing. |
| `CLAUDE.md`, section "Session discipline" | Exception to the rule "one step, one session". |

When the app refuses the start after a typed approval, this order applies:

1. Send the brief to an idle linked session of the same project, with the same permission mode.
2. If there is no such session, the session that got the approval does the step.
3. The coordinator does not do the work. It tells the owner to type the start on the Mac.

## Why
A rule cannot remove the lock of the app. An existing session needs no start, so it can continue the approved work. Phase 3 of the trend plan ran in this way in the idle session of phase 2.

The fallback applies only after an approval that the owner typed in this turn. A mod wake-up, a message from a session or a scheduled task does not open it. The rule also forbids a request to a different session to call `start_session`. Thus the lock stays in place.

Cost: a step in an existing session reads a longer history than a fresh session.

## Verification
Not verified on the phone. Only the owner has the phone. The next approval on the phone is the first real test.

## Open points
- [ ] Do the first approval on the phone with the fallback, and record the result.
- [ ] Check if the plan card and the "An Koordinator" dialog work on the phone. No test exists.

## Lessons
Do not write "the plan waits" from a note. Read `list_sessions` first, because a note can be old.
