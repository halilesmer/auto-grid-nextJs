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

## Research 2026-11-01
Remote Control is the official way, also for the Code tab of the desktop app. The [Remote Control documentation](https://code.claude.com/docs/en/remote-control) says that permission prompts and `AskUserQuestion` stay open until the user answers. It does not mention plan approval.

These bugs were open on 2026-11-01. No Anthropic staff member had replied in them:

| Issue | Symptom |
|---|---|
| [#100478](https://github.com/anthropics/claude-code/issues/100478) | Desktop Code tab, Android: the question shows only on the desktop. |
| [#102055](https://github.com/anthropics/claude-code/issues/102055) | iOS: the card is missing. Typing can cancel the card. |
| [#105055](https://github.com/anthropics/claude-code/issues/105055) | The question shows, but the answer does not get to the session. |
| [#101334](https://github.com/anthropics/claude-code/issues/101334) | iOS: an approved plan card stays on the phone. |

The [changelog](https://code.claude.com/docs/en/changelog) up to v2.1.316 has no fix for these bugs. The two push settings were already on, so they are not the cause.

## Change 2026-11-01

| File | Change |
|---|---|
| `~/.claude/scripts/ask-as-text.sh` | New. It refuses `AskUserQuestion` and tells Claude to ask in plain text. |
| `~/.claude/settings.json` | New `PreToolUse` hook with the matcher `AskUserQuestion`. It applies to all projects, in new sessions. |
| `~/.claude/rules/ajan-kullanimi.md` §10, `docs/agent-rules/ajan-kullanimi.md` | One rule line and the reason. |

Cost: on the Mac, questions are also plain text. The click cards do not appear.

Rejected:
- Channels (Telegram, Discord). They are a research preview, the documentation describes them for the terminal, and the relay covers only tool approvals.
- `ntfy` hooks from third parties. A third-party server could approve commands on the Mac, and the Mac has access to the worker and the VPS.

Owner's decision, not changed by Claude: auto mode as the default. It is a security setting.

## Verification
The hook is verified on the Mac. A new desktop session called `AskUserQuestion`, got the refusal text, and then asked in plain text. The phone is not verified. Only the owner has the phone.

## Open points
- [ ] Do the first approval on the phone with the fallback, and record the result.
- [ ] Check if the plan card and the "An Koordinator" dialog work on the phone. No test exists.
- [ ] Check if a plain-text question and a typed answer work on the phone.
- [ ] Check if the owner can change the mode from Plan to Auto on the phone, and if a typed `ja` then continues the work.
- [ ] Test `claude remote-control --spawn worktree --permission-mode auto` for a new session from the phone. Check if the session shows in the desktop app and if the coordinator mod loads.

## Lessons
Do not write "the plan waits" from a note. Read `list_sessions` first, because a note can be old.
