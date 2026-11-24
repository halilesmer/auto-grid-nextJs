---
date: 2026-11-24
author: Claude
type: decision
status: done
pr: []
features: []
areas: [rules]
---

# Merged branches and worktrees are deleted at once, without a question

## Request
A check of the open work found 127 local branches and 11 extra worktrees on the Mac. Most were from merged PRs. The project owner approved the cleanup and said: "Ve bu silme işini bir kural olarak ekle. Birleşmiş olanlar hemen silinsin." (Add this deletion as a rule. Merged ones are deleted at once.)

## Decision
| File | Change |
|---|---|
| `CLAUDE.md`, hard rule "Branch cleanup" | Now "without a question". When a PR is merged, the session deletes its branch (local and remote) and its worktree at once, and also each merged branch or worktree that it finds from other sessions. The proof of merge is: the tip is in `origin/main`, or the tip is in the head of a merged PR (`refs/pull/<n>/head`). A file comparison with `main` is not a proof. Worktrees of running sessions and worktrees with changed or untracked files stay. Before a remote branch is deleted, open PRs that use it as base move to `main`. |

## Why
The old rule said "with squash merges, compare the trees". This check gives a wrong result when `main` changes the same files later, and that is the normal case. In this cleanup the first check (a file comparison in zsh) reported "0 files different" for 6 squash-merged branches. The cause: zsh does not split an unquoted variable, so the file list was one path that did not exist. A second check in Python found differences in 5 of the 6 branches, because later PRs had changed the same files. For each of the 5, the local tip was an ancestor of the head of its merged PR (PR 535, 558, 641, 642, 643). That is the reliable proof, so the rule names it.

The app can give an old detached worktree to a new session. Two worktrees from the first list (`checklist-row-tooltip-left-…`, `eloquent-jackson-…`) held the branches of two new sessions when the cleanup started. Thus the rule keeps worktrees that a running session uses, and the check runs again directly before the deletion.

## Verification
- Deleted: 125 local branches, 7 worktrees, the stray ref `refs/remotes/pr653`. The 5 remote branches of PR 658 to 662 were already deleted on GitHub (`git fetch --prune`).
- Kept: `main`, the worktree of the running speed session (`claude/sleepy-hertz-a09f5d`), `abcd-formation-strategy-…` (untracked local hand-over note), and the worktrees and branches of 3 new sessions of this day.
- Each deleted branch passed one proof: tip in `origin/main` (ancestor), tip equal to the head of a merged PR, or tip ancestor of `refs/pull/<n>/head` of a merged PR.

## Lessons
- In zsh, `for f in $files` does not split the variable. Use `while IFS= read -r f` or Python for file lists.
- Do not delete from a list made earlier in the session. Read the worktrees again directly before the deletion.
