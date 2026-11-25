---
date: 2026-11-24
author: Claude
type: diagnosis
status: done
pr: [678, 684]
features: [SYS-17, SYS-16]
areas: [tooling]
---

# Sessions interfere through shared Git state

## Request
Halil: sessions seem to get mixed up sometimes. Find out if this happened, and take a firm measure.

## Findings
Method: journal and rule files, `git reflog` and `git stash list` of the main checkout, and a text search in the session transcripts that the search tool could read (active and archived). The search used about 15 phrases (for example "başka oturum", "another session", "git stash", "ana checkout"). It found no event where one session wrote code or a commit into the work of another session. It found these cases of shared state:

| # | What happened | Evidence | Status |
|---|---|---|---|
| 1 | Runs of other worktrees were killed by `pkill -f` with a shared pattern. 4 runs of 4 sessions stopped in 3 s. | `2026-11-15-pkill-kills-other-worktree-runs.md` | Closed by SYS-16. |
| 2 | Two stashes of a worktree session are in the shared stack. The branch of that session (`claude/harmonic-entry-stop-freeze-cea00b`) does not exist any more. Each stash holds 10 files, 154 added lines (`butChecks.ts`, `crbChecks.ts`, `garChecks.ts`, `tradeApply.ts` and more). | `git stash list`, created 2026-11-16 15:26. | Closed (2026-11-25). The files of the stash landed in PR 580 (journal `2026-11-16-harmonic-trade-frozen-stop.md`). The commit is kept as the hidden ref `refs/archive/stash-harm-wip-a2764073`; both stashes are dropped. |
| 3 | The main checkout stood on a feature branch for about 21 h (2026-11-20 14:35 to 2026-11-21 12:14), with a 37 s return to `main` in between. Other changes of branch: 11-13, 11-14, and a detached HEAD on 11-15. | `git reflog` of the main checkout. | Closed for the future by SYS-17 (branch change in the main checkout is blocked). |
| 4 | The main checkout carries `localhost:3000`. On 2026-11-23 a diagnosis session noted that it ran an old version (v0.7.686) from the main checkout, while `main` was newer. | Transcript of the diagnosis session. | Closed: only the owner updates the main checkout (dev panel, `git pull --ff-only`); sessions read `main` with `git fetch` and `origin/main` (PR 677). The hook enforces it (every `pull` in the main checkout is stopped). |
| 5 | When a worktree is deleted, the session continues in the main checkout (system note: "now operates on the origin repository"). Seen in 2 sessions on 2026-11-17. One of them had merged its PR and removed its own branch just before. | Transcripts. | Closed by SYS-18: a session in this state cannot edit files of the main checkout. Git commands are covered by SYS-17. |
| 6 | Heavy runs of other sessions load the Mac. Timing measurements gave 1.7 s to 13.8 s for the same step. | Journal entries 2026-11-05 to 2026-11-24. | Known, handled by the heavy lock (SYS-11). |

Not found: a commit on the wrong branch, a pop of a foreign stash, a push of foreign files. The transcript search is not complete: it reads phrases, not meaning. A mix-up in other words can be missing.

## Cause
All sessions use one repository. Two parts are shared by all worktrees or by all sessions in the main checkout:

- `refs/stash` is one stack for all worktrees. `git stash pop` in any worktree takes the top entry, even when another session made it.
- The main checkout has one working tree. A branch change, `git add -A`, `git reset --hard` or `git clean` there acts on the files of every session that works in it, and on the work in progress of the owner.

## Solution
| File | Change |
|---|---|
| `hooks/claude/pre-bash-shared-git.sh` | New PreToolUse hook (SYS-17). Stops `git stash` everywhere (only `list` and `show` run). In the main checkout it also stops: a branch change or file restore with `checkout`/`switch`, `reset --hard`, `clean`, `restore`, `add -A`/`.`/`-u`, `commit -a`, `rebase`, `cherry-pick`, `revert`, and `merge`/`pull` without `--ff-only`. In a worktree every other command runs. |
| `hooks/lib/cmdsplit.sh` | `split_cmd` moved here from `pre-bash-kill.sh`. Both hooks use it. |
| `.claude/settings.json` | Registers the hook for `Bash` as the third hook. |
| `hooks/RULES.md` §4.18, `hooks/README.md`, `docs/features/features.yaml` | Rule, hook table, catalog entry SYS-17. |
| `hooks/claude/pre-edit-main.sh`, `hooks/lib/gitscope.sh` | Second change (PR 684, SYS-18): PreToolUse hook for `Edit`/`Write`/`NotebookEdit`. It stops each change to a file in the main checkout that Git does not ignore. Worktrees, paths outside the repository, ignored paths, and `.claude/artifacts/` run. |
| `hooks/claude/pre-bash-shared-git.sh` | Second change: aligned with PR 677. In the main checkout every `checkout`/`switch` and every `pull` is stopped (before: `pull --ff-only` and `checkout main` ran). `is_main_checkout` moved to `hooks/lib/gitscope.sh`. |
| `e2e/mocked/main-edit-hook-lib.spec.ts` | Tests for SYS-18 on a throw-away repository. |
| `e2e/mocked/shared-git-hook-lib.spec.ts` | Tests on a throw-away repository with a main checkout and a worktree (paths with spaces). |

The target directory of a command is `git -C <path>`, else the last `cd <path>`, else the `cwd` of the session. A coordinator that runs `cd <worktree> && git add -A` from the main checkout is not blocked. If a `cd` target cannot be resolved (`cd "$X"`), only the stash rule applies.

## Why
A rule in a text file did not stop case 1 earlier. The hook stops the command before it runs, and its message tells the session what to do instead (worktree, WIP commit). The hook does not need to know who owns a stash or a file.

## Open points
- [x] Orphan stashes: archived and dropped (case 2). Restore: `git stash store -m restored refs/archive/stash-harm-wip-a2764073`.
- [x] File edits in the main checkout: stopped by SYS-18 (`pre-edit-main.sh`, RULES §4.19). Bash writes (`sed -i`, `>`) are still not checked.
- [x] Session whose worktree was deleted: covered by SYS-18 and SYS-17.
- [ ] The local `localhost:3000` shows old code until the owner presses "Update" in the dev panel. Halil decides if a launchd job should pull `main` when the checkout is clean.

## Verification
See the PR for the command output (precheck and the spec).
