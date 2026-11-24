# 2026-11-24 Branch cleanup: only the sessions you started

## Decision
Halil, 2026-11-24: "Başka oturumlara karışma. Başka oturumlar da senin işlerine karışmasın. Buna önlemini al." Then "Evet, sınırla".

## Change
`CLAUDE.md`, "Branch cleanup without a question": a session cleans up only the merged branches and worktrees of the sessions that it started. It does not touch the branches, worktrees, processes or main checkout of other sessions. It does not run `git pull` or `checkout` in the main checkout and reads `main` with `git fetch` and `origin/main`.

## Reason
Many coordinator sessions work in the same repository at the same time. The old rule ("also from other sessions") let one session delete the worktree of another session's child. A `git pull` in the main checkout changed files under the sessions that work there.
