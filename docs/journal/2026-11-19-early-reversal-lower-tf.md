---
date: 2026-11-19
author: Claude
type: feature
status: done
pr: []
features: [FRM-05, FRM-39]
areas: [frontend]
---

# AB=CD early reversal: engulfing candle also in the next lower timeframe

## Request
Decision 1119-A35.1.1 (Halil, 2026-11-19). The early reversal (1114-A4.5) looked for the engulfing candle only in the timeframe of the pattern. The normal D entry looks for it in two timeframes (ABCD-20, SIG-28). A measurement over four products, H4, one year: 7 candidates in the band, 2 with an engulfing candle in H4, 0 with enough volume. So the early reversal searches in two timeframes too.

## Solution
| File | Change |
|---|---|
| `lib/formation/earlyReversal.ts` | New inputs `sec` and `lower` (bars, volume flags, seconds of the next lower timeframe). The search runs in both timeframes from the open of the D candle. The candle that closes first is valid. New result fields `time` (open time of the engulfing candle in its own timeframe) and `lower`. |
| `lib/formation/abcdChecks.ts` | Passes the view of the next lower timeframe (`neighborTf(env, tf, 1)`, same path as ABCD-20). No lower view: same behaviour as before. |

## Rules
- Unchanged: zone contact, volume rule (SIG-24, SIG-25: a candle that is not known to be strong rejects the engulfing candle), stop and targets.
- Entry = close of the engulfing candle in the timeframe where it was found.
- `idx` stays an index in the pattern timeframe. For an engulfing candle from the lower timeframe it is the pattern candle in which that candle closes. `time` and `lower` carry the real candle.

## Superseded
The assumption in `2026-11-15-abcd-early-reversal.md` that the early reversal is stricter than ABCD-20 because it uses the same timeframe only no longer holds.

## Tests
`e2e/mocked/formation-abcd-lib.spec.ts`, tags `@FRM-05` and `@FRM-39`: engulfing candle only in the lower timeframe gives an entry; weak or unknown volume gives none; no lower view keeps the old behaviour; the candle that closes first wins.

## Open
No visible text names the timeframe of the search, so no UI text changed.
