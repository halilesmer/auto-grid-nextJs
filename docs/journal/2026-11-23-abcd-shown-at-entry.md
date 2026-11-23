---
date: 2026-11-23
author: Claude
type: fix
status: closed
pr: []
features: [FRM-05, FRM-07]
areas: [frontend]
---

# AB=CD: a trade that was not shown at entry is never shown; identity without C; history window from the entry (1122-A1.4)

## Request
After 1122-A1.3 (journal 2026-11-22-abcd-running-trade-stays), the XAUUSD H1 history scan still found AB=CD `candidateVanished` cases in three classes. Decision 1122-A1.4 aligns AB=CD with the decisions of the harmonics (1122-A3.2 = B, 1122-A3.3.2):
- a) The history window for a running trade starts at the entry, not at A. Example: M15 buy, A 2026-03-18 09:30, entry 03-23. On 03-30, A is more than 10 days back, but the trade runs with TP1.
- b) A trade that was not shown at the close of its entry candle is never shown. The next triple in the order of the selection is shown.
- c) The identity of a trade is side, entry candle and entry price, without A, B, C. The selection at the close of the entry candle stays. Example: H1 sell, C 2025-12-10 12:00, entry 12-10 22:00 (4239.26). One candle later the trend moves the C pivot to 21:00; the trade stays with the points from the entry.

## Change
- `shownTrade.ts` (new): shared helpers for AB=CD and the harmonics. `tradeKey` (side, entry candle, entry), `recordShown` (key of the shown trade per close), `tradeAtOf` (the trade that the search showed at an earlier close; computed once per context, recursively, from the candles up to that close), `hiddenOf` (rule B), `entryInHistory` (window from the entry). `xabcd.ts` now uses these helpers instead of its own copies; its behaviour does not change.
- `abcd.ts`: `selectOrder` gives all triples with a valid correction depth (youngest first). `selectPoints` is its first element. `entryIdxOf` gives the entry candle from the shape alone (no evaluation).
- `abcdChecks.ts`: `analyzeAbcd` computes the shown candidate per close. Priority (1122-A1.3) goes to the first entered trade that runs, was shown at entry and has its entry in the window. The search measures the candidates in the order of their entry candle and stops at the first hit. Without such a trade, the first triple of `selectOrder` whose trade is not hidden is shown.
- Earlier closes are computed without zones (`buildEnvWithoutZones`, 1122-A41.1). AB=CD reads zones in ABCD-10, ABCD-12, ABCD-13 and ABCD-22, in the TP1 strong-zone hint, in the early reversal and in the re-entry. None of them changes the shown trade. The early reversal applies only before level 1 is reached, and then the trade has no state (not entered). Entry, stop and state after level 1 depend on candles, divergence and the harmonic D (the verdict of Gartley and Bat, whose zone rows are bonus rows). The entry environment (big target, stop anchor A or C) is also built without zones.
- `reasons.ts` (separate commit): in the environment without zones, trends and fibs are computed at the first read (`LazyMap`). A trend that is not read costs nothing; often this is the long M15 trend for an H4 or H1 entry.
- `abcdChecks.ts` (separate commit): the computation in the entry environment gives only the big target and the stop anchor (`entryFactsOf`). `evaluateFull` and `entryFactsOf` use the same functions (`levelContextOf`: near distance, second levels, harmonic D; `frozenAt`: stop anchor; `bigTargetOf`). Zones, signals, early reversal, re-entry and drawings are not computed at the entry.
- Fallback (separate commit): when the depth of the last three pivots is not valid, they are the last element of the order. If every valid triple carries a hidden trade, the search shows the last three pivots (no entry yet) instead of no candidate. Fixture `abcd-buy-h4-02`, 2025-07-14 16:00 to 07-15 00:00.
- Tests:
  - `formation-abcd-vanish-classes-lib.spec.ts` (real candles): one test for each class a, b, c (red on main, green now); c) no look-ahead (the stored selection is the same with candles cut at the close of the entry candle); b) next best candidate with `abcd-buy-h4-02` (the trade A 2025-07-10 00:00 is never shown, also after the end of the trade that was shown at its entry); fallback test with full and cut candles (red without the fallback commit, green with it).
  - `formation-trade.spec.ts` (decision 1122-B6): the two tests "TP1 and TP2 taken" used `abcd-buy-h4-02` at 2025-07-16 00:00. There, main showed the sell A 07-10 16:00 / C 07-11 00:00 with TP1 and TP2. That trade was not shown at the close of its entry candle, so rule B never shows it. The tests now use 2025-06-12 16:00 (buy, entry 0.82389, ends in the last candle). All assertions stay; the actual result of the TP1 + TP2 box changes from +1.08 to +0.81 (hand calculation in the spec). `formation-abcd-vanish-classes-lib.spec.ts` keeps the old moment: at 07-16 00:00 the hidden sell is not shown (full and cut candles).
  - Decisions 1122-B1.1 to B1.3 for existing tests: the expectations now state what the search shows (`formation-abcd-frozen-from-lib.spec.ts`: at 05-14 17:00 the search shows C 4705.54 with entry 4678.93, never the triple with C 4710.02; `formation-abcd-lib.spec.ts`: sig-diverg 12-02 shows the sell shown at entry in its ended state; sig-rsi A 11-07 is shown 11-10 04:00 to 12:00, A 11-05 is never shown, no candidate at 11-11 04:00). The evaluation assertions stay and use `checkAbcdCandidate`. `formation-legend-lib.spec.ts` uses the last close of the fixture as the time (B1.3).

## Cost limit
Decision 1122-B4 (coordinator, under the night authority of Halil, 2026-11-23): absolute limits instead of +20 % over main. Worst case of cold `scanFormations` for H4 + H1 + M15 at most 15 s (Halil approved "below 15 s" in 1122-A41.1); for D1 + W1 + H4 + H1 at most 3.2 s (the value of main after PR 648, which Halil accepted). Reason: AB=CD loses no running trade, and the harmonic result does not change.

## Evidence
- Harmonic result against main (de977308): sweep of 110 fixtures × GAR, BAT, BUT, CRB, CYP, candle by candle: 0 different lines of 103,810; XAUUSD, 10 moments, both sets of timeframes: 0 of 150 per set.
- Local replay of the history scan, XAUUSD H1, step 4, 1560 scans (H4 + H1 + M15): AB=CD `candidateVanished` 0.
- All lib specs passed (2743), under the heavy lock.
- Cost, cold `scanFormations` (all forms), XAUUSD, under the heavy lock, same method as 1122-A41.1: 10 moments, each 3 times, random order over the versions, the value of a moment is the smallest of the 3; main (de977308) in the same run. Load average at start 6.7, at end 2.5.

| Timeframes | Version | Median | p90 | Worst case (moment) |
|---|---|---|---|---|
| D1 + W1 + H4 + H1 | main | 0.83 s | 1.17 s | 1.22 s (11-10 00:00) |
| D1 + W1 + H4 + H1 | this change | 1.08 s | 1.92 s | 2.09 s (11-10 00:00) |
| H4 + H1 + M15 | main | 6.5 s | 9.3 s | 9.4 s (09-18 20:00) |
| H4 + H1 + M15 | this change | 8.3 s | 11.2 s | 12.7 s (09-18 20:00) |

  Per form at 2026-10-27 23:00, H4 + H1 + M15: ABCD 0.11 s on main, 4.4 s with this change (total 9.7 s → 11.6 s).

  Intermediate results (same method, worst case H4 + H1 + M15 / D1 + W1 + H4 + H1): earlier closes and entry environment without zones 19.9 s / 2.76 s; plus lazy trends and fibs 15.88 s / 2.57 s (above the limit of 15 s); plus the light entry computation 12.7 s / 2.09 s (this change).

## Open findings
- The recursive "shown at entry" decision computes the search again at each earlier close that it needs. A single forward pass, candle by candle, that keeps the shown trade per close would avoid this. It is a shared design for the harmonics and AB=CD; the coordinator proposes it to Halil as a separate task.
- The harmonic history window still starts at X (class a is fixed only for AB=CD); the harmonic result had to stay identical to main in this change.
