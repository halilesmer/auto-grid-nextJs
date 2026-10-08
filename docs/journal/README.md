# Project journal

The journal records the knowledge that the code and the git history do not show: root causes, diagnoses, decisions, approved plans and open points. The project owner, colleagues and Claude read the journal and write it. The rules are in `hooks/RULES.md` §7.

## When to write an entry

| Write an entry | Do not write an entry |
|---|---|
| A change of behavior (feature, setting, engine logic) | A typo, formatting or a code comment |
| A bug fix (cause and fix) | A dependency update without a change of behavior |
| A defect that stays open | A change to documents only |
| A diagnosis without a code change (VPS, MT5, network) | A version bump |
| A decision with alternatives (architecture, tools, rules) | |
| An approved plan for more than one PR | |

- Put the entry in the same PR as the change.
- One entry can cover more PRs on the same topic. Then update the entry. Do not write a new one.
- The PR description can be short and link to the entry.

## Find entries

```bash
ls docs/journal/                                # all entries, oldest first
grep -l 'ENG-21' docs/journal/20*.md            # entries for one feature
grep -l 'grid_orders.py' docs/journal/20*.md    # entries for one file
grep -l '^status: open' docs/journal/20*.md     # entries with open points
```

Before you change an area, read its entries.

## File name and template

File name: `docs/journal/YYYY-MM-DD-<short-slug>.md`. The date is the date of the event. The slug is English, in lower case, with hyphens.

Copy the template. Delete the sections that do not apply.

```markdown
---
date: YYYY-MM-DD
author: <Codex | Claude | project owner | colleague>
type: fix
status: done
pr: [97]
features: [ENG-21]
areas: [worker]
---

# <What happened, max. 8 words>

## Request
What the user asked for. Max. 6 lines.

## Cause
Only for fix, defect and diagnosis: symptom, how it was found, root cause.

## Solution
What changed. Show the important files in a table: | File | Change |

## Why
The decision, and the alternatives that were rejected, with the reason.

## Verification
The tests and checks that were done, with the result.
If a check was not possible, write "not verified" and the reason.

## Open points
- [ ] The item that remains.

## Lessons
What to do, or not to do, next time.
```

Front matter values:

| Key | Values |
|---|---|
| `author` | The person or AI that wrote the entry. Use `Codex` for entries written by Codex. |
| `type` | `feature`, `fix`, `defect`, `diagnosis`, `decision`, `plan`, `ops` |
| `status` | `done` (nothing remains) or `open` (an item in "Open points" remains) |
| `pr` | PR numbers, for example `[97, 102]`; empty list `[]` if there is no PR |
| `features` | IDs from `docs/features/features.yaml`, for example `[ENG-21]`. A `plan` entry can also name planned IDs. |
| `areas` | `worker`, `frontend`, `ops`, `docs`, `tests`, `tooling` |

When the last open point is done, the PR that does it sets `status: done`.

## Writing rules (ASD-STE100)

Write in English. Use the writing rules of ASD-STE100 (Simplified Technical English). This table shows the rules that apply most.

| # | Rule | Example |
|---|---|---|
| 1 | Write max. 20 words in a sentence of a procedure, and max. 25 words in a description. | |
| 2 | Write one instruction in one sentence. | "Stop the bot. Then pull the update." |
| 3 | Use the active voice. | "The bot deletes the order." Not: "The order is deleted." |
| 4 | Use only these tenses: present, past and future. | "The worker restarted." Not: "The worker has been restarting." |
| 5 | Use the imperative for steps. | "Open MT5." |
| 6 | Use one word for one meaning, and one word for one thing (see the glossary). | |
| 7 | Do not make noun clusters of more than 3 words. | "the time of the last metrics write" |
| 8 | Keep the articles (a, an, the). | |
| 9 | Do not use idioms, slang or filler words. | Not: "basically", "just", "kind of" |
| 10 | Use a list or a table for more than 2 items or steps. | |
| 11 | Start a warning with the command. Then give the reason. | "Do not run git as administrator. Pulls fail after this." |

Technical names of this project are permitted (STE permits technical names and technical verbs). Examples: zone, level, magic, fill, pending order, worker, terminal. Nobody checks the STE dictionary automatically. Use simple, common words.

## Schema before text

- Use the front matter and the sections of the template.
- Use tables and lists. Use prose only in "Why" and "Lessons".
- Delete the sections that do not apply. Do not write "n/a".
- Copy log lines, error codes and commands exactly, in code format, so that `grep` finds them. Find each name in the code before you write it (`git grep`).

## Privacy (the repository is public)

Do not write these data in an entry:

| Not permitted | Write this |
|---|---|
| Passwords, API keys, tokens (also `WORKER_API_KEY`) | "the admin key" |
| MT5 account numbers (logins) | "DEMO account A", "account B" |
| Broker names, MT5 server names | "the broker", "the demo server" |
| IP addresses, host names, ngrok URLs, VPS user names | "the VPS", "the Mac", "the ngrok URL" |

`127.0.0.1` and `0.0.0.0` are permitted. Log lines and error messages are permitted after you remove these data.

## Glossary

| Term | Meaning | Do not use for this meaning |
|---|---|---|
| worker | The FastAPI process on the Windows VPS (`worker_python/`) | backend, server |
| bot | The trading subprocess of one account (`src/core/bot_runner.py`) | robot, EA |
| terminal | One installed MetaTrader 5 instance (`terminal64.exe`) | MT5 (for one instance) |
| frontend | The Next.js app (`frontend_nextjs/`) | UI, client |
| zone | A price range with its own grid or fractal settings | band, area |
| level | One price step of the grid in a zone | |
| magic | The fixed number of a zone; its MT5 orders carry it (ENG-27) | |
| setup | One configuration of a symbol; a former zone (ZON-19). Before ENG-29, the word also meant an additional fractal configuration in a zone | |
| pending order | An order that waits for its price (limit or stop) | |
| fill | MT5 executes a pending order, and a position opens | trigger, hit |
| journal | This project journal (`docs/journal/`) | — |
| MT5 journal | The log file of a terminal (`MT5_Terminal_<YYYYMMDD>.log`) | journal (alone) |
