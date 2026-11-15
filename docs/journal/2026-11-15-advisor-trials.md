---
date: 2026-11-15
author: Claude
type: decision
status: done
pr: [543, 556, 557, 564]
features: [ZON-08, UI-17, UI-30, SYS-16]
areas: [docs, tests]
---

# Advisor trials: Sonnet main model with a Fable advisor

## Request
Measure in real work if "Sonnet as main model + Fable as advisor" (Claude Code `/advisor`) can replace a more expensive main model. Three trials ran on 2026-11-14 and 2026-11-15.

## Decision
The model table in `CLAUDE.md` does not change. Confidence: medium. The trials show that the advisor helps in debugging, but they do not show that the result is better than Sonnet alone, and the cost could not be measured.

## Method
- A worktree made by hand, with `.claude/settings.local.json` = `{"advisorModel": "fable"}` (the file is ignored by git). The setting applies to sessions that start in that folder.
- Session: Sonnet, effort medium, fresh context.
- Advisor calls are in the session transcript as `server_tool_use` with the name `advisor`. Count them there; the report of the session is not sufficient (trial 2 reported 1 call, the transcript has 2).
- Blind replay for debugging: the worktree is at the parent commit of a known fix. The brief gives only the symptom. Blind rules: no `fetch`, no `origin`, no `gh`, no `git log --all`, no reflog, no files outside the worktree, no later journal entries. After the run, search the transcript for commands that break these rules.

## Results

| Trial | Task | Advisor calls | Result |
|---|---|---|---|
| 1 | Implementation with a clear brief: atomic write of the UI state (ZON-08, PR 543) | 0 | Merged. The session did not ask the advisor. |
| 2 | Blind replay of PR 524 (UI-17, dock) | 2 | The draft is covered by PR 524. It also showed a real product defect (row padding in the dock fit) that PR 557 confirmed and repaired. One number of the session (560 px against 2.6 px) could not be measured again. |
| 3 | Blind replay of PR 537 (UI-30, price scale) | 2 | Test cause found, same as PR 537 (a formation line takes the drag; it depends on the clock). Product defect found at the same place (Fit), but with a different mechanism that the session did not prove, and with a heavier repair (a retry loop of up to 60 frames) than the 2-line repair of PR 537. Blind rules: 0 hits. |

Notes on trial 3:
- The session said that the two advisor calls changed its direction: the first one after a patch that failed at every hour ("the clock is a factor, sort the causes"), the second one toward numeric measurement and the library source.
- PR 537 was written by Sonnet without an advisor and found the simpler repair. Thus trial 3 does not show a quality gain.
- One idea of the draft went to `main`: the free drag point (`freeY`), PR 564. See `2026-11-15-e2e-ui26-ui30-flake-diagnosis.md`.

## What the trials show
- With a clear brief, Sonnet does not call the advisor. The setting costs nothing there and gives nothing.
- In debugging with an unclear cause, Sonnet calls the advisor by itself (2 calls in each trial). The calls were useful: one led to a real defect, one stopped a wrong patch.
- No trial compares the same task with and without the advisor. Thus the gain against Sonnet alone is not known.

## Limits
- Cost: the usage bars moved in trial 3 (5-hour 1 % → 32 %, weekly 52 % → 56 %, Fable 17 % → 20 %), but other sessions and the coordinator (on Fable) ran at the same time. The part of the trial cannot be separated.
- Three trials, one task each. No repeat.
- The Mac was under heavy load in all trials (parallel sessions, `npm ci` and e2e runs).

## Evidence that would change the decision
Two runs of the same bug, one with and one without the advisor, on a Mac with no other session, with the usage bars read before and after each run.

## Side results
- An unscoped `pkill -f` of one session stopped the precheck runs of all worktrees (2026-11-15 00:38 UTC). Guard: SYS-16, PR 556.
- Trial 3 used two unscoped `pkill` patterns for its own processes. Its worktree was at a commit before SYS-16, so the hook was not there.
- A background job that ends does not always wake the session that started it (seen 2 times on this day: in trial 2 and in the session of PR 564). A coordinator must not assume that an idle child session is still waiting for a result.
