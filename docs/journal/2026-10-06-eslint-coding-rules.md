---
date: 2026-10-06
type: decision
status: open
pr: []
features: []
areas: [frontend, tooling]
---

# ESLint enforces three coding rules

## Request
The owner has written coding rules as text. Three of them can be checked by a tool. The owner wants ESLint to enforce them in `frontend_nextjs/`, and wants all existing violations fixed in the same PR.

## Solution

| Rule (text) | ESLint rule | Violations before | Level |
|---|---|---|---|
| Do not write a nested ternary. | `no-nested-ternary` | 53 in 27 files | `error` |
| Do not write an empty `catch`. | `no-empty` (without `allowEmptyCatch`) | 0 | `error` |
| Do not write `else` after a branch that ends with `return`. | `no-else-return` with `allowElseIf: false` | 0 | `error` |

| File | Change |
|---|---|
| `frontend_nextjs/eslint.config.mjs` | A separate config object after `...nextTs` with the three rules |
| 27 files in `frontend_nextjs/src/` | Each nested ternary became one of these: a small function with early returns, a lookup `Record`, a named intermediate variable, or separate `&&` blocks for exclusive JSX branches |

The fixes are a structure change only. The rendered output and the test expectations did not change.

## Why
A rule that only exists as text erodes under delivery pressure. A lint rule stops new violations in CI (`npm run lint` runs in `.github/workflows/tests.yml`).

The owner had two options for the 53 existing violations:
- Fix all of them in this PR.
- Set the rule to `error` and add a per-file `eslint-disable` for the 27 files.

The owner chose to fix all of them. Thus no suppression comments remain.

## Verification

| Check | Result |
|---|---|
| ESLint version (`node_modules/eslint/package.json`) | 9.39.5; the three rules and their options exist in this version |
| `npm run lint` | 0 errors, 0 warnings |
| `npx tsc --noEmit` | 0 errors |
| A temporary file with `catch {}` and `else` after `return` | ESLint reported both as `error` |
| `npm run test:e2e` (mocked) | 195 passed, 2 failed with `Test timeout of 30000ms exceeded` (`@ZON-02` "Zone löschen", `@ZON-04` "Grid-Felder") |
| The 2 failed tests again, `--repeat-each=3` | 6 of 6 passed (10–12 s each) |

The 2 timeouts occurred only in the full parallel run. The tests did not fail in isolation. A run of the full suite on `main` for comparison was not done.

## Open points
- [ ] `no-else-return` does not find `else` after `throw`. This part of the rule stays a manual check.
- [ ] `no-empty` accepts a `catch` that contains only a comment. The rule "log a swallowed error and write the reason" stays a manual check.
- [ ] `worker_python/` has no linter. The same rules are not enforced for Python.

## Lessons
Before you set a lint rule to `error`, count the violations with the rule at `warn`. A rule with zero violations can go to `error` at once.
