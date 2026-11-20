---
date: 2026-11-20
author: Claude
type: fix
status: closed
pr: []
features: [FRM-05, FRM-39]
areas: [frontend, formation, i18n]
---

# EWO hint wording and stronger big-target freeze tests

## Request
Two small items: (1) the hint of the trend rule list (`cw.trend.rule.hint`) did not match the code; (2) two tests of the "big target freezes at entry" change (PR 573) would pass without the fix.

## EWO hint (1120-A13.7)
The hint said the EWO color is valid "on the fractal candle or on one of the next two candles". `hasSideColor` in `trdZug.ts` uses the window `idx..doneAt`. `doneAt` is the candle that completes the fractal (`trd.ts`, `byDone`): usually two candles later, later with equal highs or lows. The hint (tr/en/de) now says "from the fractal candle up to the candle that completes it (usually two candles later)". Code unchanged.

## Weak tests
Mutation check: the line `if (entryRun) big = entryRun.big;` in `abcdChecks.ts` was disabled. Before the change, 2 of the 5 freeze tests went red (GAR-18 test, "five tails" test). The two weak ones stayed green:

- "Girişte harmonik D yoksa sonradan da doğmaz": the series `X_NO_HARMONIC` has no harmonic D at any time, so the freeze cannot matter.
- "Giriş henüz olmadıysa …": with no entry, the freeze branch (`reached && d`) is not entered. The code path does not exist without an entry.

New test "harmonik D girişte yok, girişten sonra oluşuyor": a Gartley with short legs (X 2, A 4, B 6, C 8, D 14). The entry candle 13 touches Level 1 with its wick. The ATR (period 14) does not exist on candle 13, so the closeness measure is missing and the harmonic D is "unmeasurable" at entry. On candle 14 (the D) the ATR exists and the harmonic D is met. Expected: today ABCD-16 is met, but `tpBig`, `tpBigAtEntry`, `tpBigActivation` stay undefined and no Z-ABCD-09 line. Control: same series without the wick, entry is the D itself, big target exists. This pins the difference to the environment at the entry candle.

Evidence (mutation, `formation-abcd-lib.spec.ts`, `-g "dondurulur|giriş henüz"`):

- Freeze disabled: 3 failed (GAR-18 test, five-tails test, new test), 3 passed.
- Freeze restored: 6 passed; whole file 187 passed.

The test "giriş yokken" cannot turn red by this mutation, because the mutated line is only reached with an entry. It now also pins the opposite side (the same candidate gets the target once the entry candle exists). The `X_NO_HARMONIC` test got two tails with a close above and below the old range; it still cannot turn red, because that series has no harmonic D in any environment. Both stay as regression guards, not as freeze proof.

## Lesson
A freeze test needs a series where the frozen value and the current value differ. Find the inputs that change with time (ATR history, zones, X close) and build the difference on purpose.
