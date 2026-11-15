---
date: 2026-11-15
author: Claude
type: fix
status: open
pr: []
features: [SYS-16]
areas: [hooks, claude-code]
---

# Kill hook: quote-aware split and wrapped command names

## Request
Fix two defects in `hooks/claude/pre-bash-kill.sh` found at the end of a session audit (measured on 2026-11-15 with JSON input).

## Problem
- False alarm (exit 2): `git branch | grep -E "advisor|pkill|nws"` and `echo 'a; pkill -f x'`. Root cause: the hook split the command at `; && || | & ( \`` without looking at quotes. A piece that began with the word of the kill command then looked like a command.
- Miss (exit 0): `/usr/bin/pkill -f playwright`, `env pkill -f playwright`, `env VAR=1 pkill …`, `\pkill …`, `/usr/bin/killall node`. Root cause: only a bare command name at the start of a piece matched. Full path, `env` and backslash were not in the wrapper list.

## Solution
- New function `split_cmd`: a bash loop that tracks quote state. Outside quotes `; & | (` backtick and newline split. In single quotes nothing splits. In double quotes only `$(` and backtick split, because they run a command.
- New function `normalize`: removes wrappers (`sudo`, `env`, `xargs`, flags, `VAR=value`) and reduces `\pkill` and `/path/to/pkill` to the bare name.
- A piece that starts with `sh -c` or `bash -c` is split and checked again without the outer quotes, so `bash -c 'echo a; pkill -f x'` is caught.
- Unclear case stays blocked: the hook only lets a command pass when no piece is a kill command, or the pattern holds the path of this checkout.

## Tests
`e2e/mocked/kill-hook-lib.spec.ts` (`@SYS-16`). New blocked cases: the five misses, `FOO=1 pkill`, a chain with a full path, `bash -c` with a chain, `$(…)` in double quotes. New allowed cases: both false alarms, `"a && pkill"` in double quotes, `env FOO=1 pkill -f "<own path>"`.

## Not covered
- Command names built at run time (`$CMD -f x`, `eval`, `sh script.sh`) and aliases pass. The hook reads text, not the shell.
- `RULES.md` §4.16 got two sentences for the new behaviour.
