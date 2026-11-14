---
date: 2026-11-14
author: Claude
type: fix
status: done
pr: []
features: [FRM-05]
areas: [frontend]
---

# ABCD stays forming after C is broken

## Request
Halil showed a GBPUSD H4 chart. The ABCD badge showed "ABCD · oluşuyor" (forming), but the price had fallen below C and below A before D. From A, B, C no D can form. Halil decided: follow the trend path; if the trend turned and C is broken, the ABCD is invalid.

## Cause
- `abcdChecks.ts` sets the verdict to `forming` while ABCD-03 (close beyond B) or ABCD-08 (D reaches level 1) is `unmet`. Only ABCD-01/02/04/05/06 and the exclusions ABCD-21 to ABCD-25 make it `invalid`.
- No rule looked at the price beyond C before D. So a broken structure stayed `forming` until the trend path gave a new C.
- Measured on the real candles (trend setting of the chart: `welle382`, 2.5 ATR, 1 close): A 1.32721, B 1.35026, C 1.33412, D so far 1.34587, level 1 1.35717. The trend path drew the high 1.34587 after C, so the reference of the next trend change was C. The H4 candle 2026-11-11 08:00 closed below C, and the trend changed to `down` with `refPrice` 1.33412.

## Solution
| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/abcd.ts` | New `trendBreaksC(trend, shape, entryIdx)`: true when a trend change after C goes against the D leg, comes before the entry candle (the first candle that reaches level 1, HDL-14; no limit while D is not reached), and its reference lies at C or beyond. |
| `frontend_nextjs/src/lib/formation/abcdChecks.ts` | New exclusion ABCD-26 (assumption). When ☑, the verdict is `invalid` with `invalidBy: ['ABCD-26']`. |
| `frontend_nextjs/src/lib/formation/ruleTexts.ts` | Text of ABCD-26 in tr/en/de. |
| `frontend_nextjs/e2e/mocked/formation-abcd-lib.spec.ts` | Hand-built cases (☑ before D, ☐ without change, ☐ when C breaks after D, ☐ when C breaks after the entry and a new extreme follows, mirror case) and the real case `abcd-breakc-h4-01`. |
| `frontend_nextjs/e2e/fixtures/formation/abcd-breakc-h4-01.json` | GBPUSD H4 2026-06-01 to 2026-11-13 (719 candles), trend setting in `FIXTURE_TRENDS`. |

## Why
- The rule uses the trend change of the trend model, not a single close below C. The trend model already confirms a change with the closes of the user's setting (`changeCloses`). This is what Halil asked: "trend oluşmuşsa ve C kırılmışsa".
- When the reference of the change is A (no new high after C), a close beyond A is also beyond C, because ABCD-05 keeps C between A and B. So the condition "reference at C or beyond" covers both cases.
- A break of C after D does not count. For a sell at D, a fall below C is the way to the target.
- The limit is the entry candle from PR 547 (first candle at level 1), not the outermost wick. Otherwise a trade that went to its target and later made a new extreme would become invalid. The case `S_BREAK_AFTER_ENTRY` tests this; with the outermost wick as limit it fails.
- Source: Halil 2026-11-14. Same reading as GAR-18 for C. The rule book gives no number, so the status is assumption.

## Verification
- `formation-abcd-lib.spec.ts`: all cases pass. The real case is `forming` at 2026-11-11 08:00 (candle not closed) and `invalid` (ABCD-26) at 12:00: no look into the future.
- All `*-lib.spec.ts` logic tests pass (see PR).

## Open points
- [ ] Gartley, Bat, Butterfly, Crab and Cypher can have the same gap (C broken before D). Check them one by one.
