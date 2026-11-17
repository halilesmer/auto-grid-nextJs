---
date: 2026-11-17
author: Claude
type: decision
status: done
features: [SYS-10]
areas: [tests, rules]
---

# Rule 4.17: no second precheck, compare flaky tests with main

## Request
The project owner approved an addition to `hooks/RULES.md` §4 item 17 on 2026-11-17 (1116-A30.1). He wanted the text exactly as written.

## Decision
Two rules:
1. If `precheck.sh` fails only in tests that the diff cannot affect, do not start a second full run. Run each failed test alone. Copy all result lines into the PR description.
2. Before auto-merge, and after each new push, compare each flaky or failed test of the last CI run of the PR with the last three `tests.yml` runs on `main`. A test that passes on the first try on `main` but is flaky in the PR is a finding of that PR.

## Reason
- PR 579 merged without this comparison. `main` stayed red for one run.
- The dock test (UI-17) was the cause. See journal `2026-11-16-chart-drawing-tests-scan-race`.
- On PR 584 the comparison was skipped after the second push.
- A second full precheck holds the heavy lock for 15 minutes or more and often fails again for the same reason.

## Limit
With auto-merge off, the mod does not yet send a "CI finished" event. The session must check the CI result when it is told to continue. A separate task (1116-A35.1) covers this in the pr-izleyici mod.

## Addition to §1.8
The project owner also approved an addition to §1.8 on 2026-11-17. It describes the mod change 1116-A35.1 (`~/.claude/mods/pr-izleyici`, 40 tests green, live proof in the next PR). The change is documents only; the precheck of this PR is enough.
