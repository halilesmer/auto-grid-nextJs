---
date: 2026-11-02
author: Claude
type: fix
status: done
pr: []
features: [FRM-21]
areas: [frontend]
---

# Formation scan error shows in the selected language

## Request
Finding 45 of the formation review: when the formation scan fails, the page /formasyon shows a German text in all languages. Visible text must go through i18n.

## Cause
`useFormationScan.ts` put `err.message` into the page alert. The messages come from the candle checks in `FormationContext` (`context.ts`: value not finite, time not strictly increasing). These messages are for developers and are in German, so a user with tr or en saw German text.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/hooks/useFormationScan.ts` | The scan error is always the i18n text `formation.scan.badData`. The technical message goes to `console.error`. |
| `frontend_nextjs/src/i18n/messages/formation.ts` | New key `formation.scan.badData` (tr/en/de). |
| `frontend_nextjs/e2e/mocked/formation-page.spec.ts` | FRM-21 test with two swapped H4 candles in tr and en. |
| `docs/features/features.yaml` | FRM-21: the message is in the selected language. |

## Why
One fixed text is the smallest change. To map each error kind to its own text, `context.ts` (a shared file) must throw error codes; the user cannot act differently on the two kinds, so one text is sufficient. The alert title already uses `formation.scan.failed`, so the body uses a different key and does not repeat the title. Load errors from the worker (`detail`) stay as they are: worker messages are not translated (convention in `CLAUDE.md`).

## Verification
See the PR: the new FRM-21 tests failed before the fix (the alert showed the German message) and pass after the fix.

## Lessons
Do not show `err.message` of library code in the UI. Show an i18n text and log the technical message.
