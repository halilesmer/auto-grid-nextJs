---
date: 2026-11-18
author: Claude
type: decision
status: done
pr: []
features: [FRM-48]
areas: [frontend]
---

# A link with a formation skips the search question

## Request
Plan 1114-A1 asks "Search formations?" for a symbol that is not a favorite. A link such as `/chart?symbol=…&tf=H4&form=ABCD` showed the same question, and the formation of the link was not drawn until the answer. Decision of the project owner (2026-11-18): when the address holds a formation, skip the question. The chart shows first, the search starts in the background after the candles, and the result badge comes at the end.

## Solution
| File | Change |
|---|---|
| `src/hooks/useFormationAsk.ts` | New input `linkForm`. The hook decides once, for the first key of the page: `form=` present means "yes" for that key. |
| `src/components/chart-page/OneChart.tsx` | Passes `linkForm: urlForm !== null`. `urlForm` is already checked against the known formations (`useChartParams`), so an unknown value does not count. |
| `e2e/mocked/formation-ask.spec.ts` | Four tests (link, unknown value, "Hayır" then `form=`, other symbol). |

## Why no loop and no wrong consent
- The UI writes `form=` itself (`setView({ form })` when the user picks a formation; `setSymbol` keeps `form=` in the address). So the consent is not "form= is in the address now". It is "form= was in the address when the page opened", stored per key.
- After "Hayır" the key is already decided (no link consent), so a later `form=` starts nothing. A new symbol is a new key: the question comes back.
- `answered === 'no'` also blocks the link consent. "Yes", favorites, "Tekrar dene" and the error toast are unchanged.

## Result notice
No change was needed. `useFormationAskStatus` reports the first search after the release (`announced !== key`), so a link opens with the same result badge in the formation row (wide view) or the toast (phone). The strip shows the running state while the search runs. If the formation of the link is not found, the page shows the other formations as before (`form` falls back to the first one with a candidate, else the link value) and the empty-state note of the row says so.

Screenshots (1440 px, dark theme, mocked data): `docs/journal/images/2026-11-18-form-link-scan-running.png` (search running) and `…-done.png` (badge "9 aday · H4: 2", ABCD drawn).
