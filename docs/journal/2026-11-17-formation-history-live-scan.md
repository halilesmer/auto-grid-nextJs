---
date: 2026-11-17
author: Claude
type: diagnosis
status: done
pr: [605]
features: [FRM-39]
areas: [frontend]
---

# Formation history scan on live candles (read only)

## Request
Plan 1114-A4. Walk the formation library bar by bar over one year of live H4 candles for six products and count AB=CD, C leg and harmonics. Check invariants. Explain three open findings. The scan only reads; it never starts the bot and never places an order.

## Method
- Spec: `e2e/live/formation-history.spec.ts` (tag FRM-39, project `live-demo`, runs only with `E2E_LIVE=1`; CI and `precheck.sh` do not run it).
- Window: last year of H4 (1560 bars, step 1). H1 was dropped from this round.
- Per bar: `scanFormations` on a `FormationContext`; the spec counts per scan state and per distinct A/B/C key.
- A pure diagnostic hook `src/lib/formation/diag.ts` counts the early reversal funnel and the re-entry exits. It does nothing unless the spec sets a sink. It changes no result: the EURUSD candidate, entry and harmonic counts are the same with and without it.

## Counts (old code, before PR 596, 600, 601)
| Product | Candidates | Entered | C legs | Harmonic candidates GAR / BAT / BUT / CRB | `riskNotPositive` |
|---|---|---|---|---|---|
| XAUUSD (copy of the coordinator) | 86 | 6 | 85 | 51 / 46 / 63 / 78 | 518 |
| EURUSD | 62 | 8 | 57 | 39 / 53 / 36 / 32 | 244 (+112 `abcdEntryStopChanged`) |
| GBPUSD | 58 | 6 | 52 | 52 / 52 / 64 / 59 | 209 |
| USDJPY | 62 | 5 | 60 | 69 / 69 / 120 / 108 | 58 |
| AUDUSD | 42 | 6 | 41 | 33 / 26 / 32 / 27 | 744 |
| NZDCAD | 93 | 7 | 90 | 42 / 44 / 53 / 35 | 263 |

All violations are Butterfly or Crab (`BUT`, `CRB`). The XAUUSD copy has no split by side and formation. Early reversal and re-entry counted 0 on every product.

## EURUSD on merged main (PR 596, 600, 601)
| | Old code | New code |
|---|---|---|
| `abcdEntryStopChanged` | 112 | 0 |
| `riskNotPositive` (BUT, CRB) | 244 | 0 |
| Candidates / entered | 62 / 8 | 62 / 8 |

The invariants stay strict. The fixes close both groups on EURUSD. Other products were not run again on the new code.

## Why the early reversal and re-entry never fire (EURUSD, new code)
Early reversal funnel. States are scan states; keys are distinct candidates.
| Stage | Condition | States | Keys |
|---|---|---|---|
| 1 | D exists, level 1 not reached | 693 | 61 |
| 2 | and not invalid | 188 | 23 |
| 3 | and D beyond the −0.272 extension | 2 | 2 |
| 4 | and a same-side zone touched by the D candle | 2 | 2 |
| 5 to 8 | Engulf after D, volume, zone touch, stop side | 0 | 0 |

Re-entry (`reentryOf` called while the first trade has TP1): 684 states, 17 keys.
| Exit | States | Keys |
|---|---|---|
| no zone at D | 451 | 8 |
| all zones consumed | 199 | 13 |
| TP1 only (no TP2) | 20 | 5 |
| zone stands, no touch after TP | 14 | 2 |
| re-entry produced | 0 | 0 |

`reentryTp1Only` means: the first trade took TP1 only and the price went back to the Engulf zone at D; it is a warning, not a value. The other flag definitions are in `info.flagDefs` of the summary file.

## Findings
- **TP1 and TP2 box (0.90 against 0.76).** Not reproduced without the exact as-of time. Probable cause: once TP1 is taken, the box shows the realized result (`realizedOutcomesOf`, `src/lib/formation/trade.ts`, plan 1115-A21.1). It uses the fill prices that `tradeStatusOf` stored, not the distances at the entry; the risk stays the original stop. A hand calculation with entry distances gives 0.76.
- **"CRV" and "SIG-29" in the UI.** SIG-29 is printed as plain rule id in the right column of the checklist (`FormationChecklist.tsx:187`). "CRV" appears only in the German rule texts (`ruleTexts.ts:147`, `:229`); Turkish and English say "reward-to-risk ratio". This breaks the rule "no opaque abbreviation in the UI".
- **Deep link `form=ABCD`.** The URL selects the formation only. The candidate is `list[0]` (`OneChart.tsx:174-179`), and `pickedId` is `form-tf`, the same for all candidates of one formation. No comment or test says this is intended. It is a gap.

## Open points
- The scan time per state grows with history length (2.5 to 15 s per scan for one year). The cause is not measured.
- The five-product run used code from before PR 596, 600 and 601; only EURUSD was run again.
- One screenshot kind (big target) was made. The C leg example (EURUSD, 2025-11-19T04:00) showed "no candidate" on the page; the reason is not checked.
- NZDCAD stopped once with a network error (DNS) and was run again.
