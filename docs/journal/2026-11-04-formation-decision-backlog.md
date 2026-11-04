---
date: 2026-11-04
author: Claude
type: decision
status: open
pr: []
features: [FRM-02, FRM-03, FRM-04, FRM-05, FRM-11, FRM-12, FRM-13, FRM-14, FRM-15, FRM-16]
areas: [frontend]
---

# Formation decision backlog decided from the rule book

## Request
- An audit of the open journal entries on 2026-11-04 found ten formation questions that block code changes.
- Decide each item from the teacher's own wording in the local rule book. Mark an interpretation as "Varsayım". Ask the project owner only where the material says nothing.
- This entry and the journal files change. The detection code does not change here.

## Decision
- Every item has a decision below. The decision text with the full reason is in the journal file of the item, below its open point.
- "Source" names the rule book file and the rule ID. The rule book is local and git-excluded (the repo is public). "Decision log" is the local decision log of the formation work.
- A box is closed only where no code change follows. Six items need a code change; they are listed in "Code changes that follow".

| # | Item (journal file) | Decision | Source | Code change | Question |
|---|---|---|---|---|---|
| 1 | Minimum length of the bowl (`2026-10-28-formation-tdf.md`) | No minimum length. Closed. | TDF-21, TDF-22 (bowl defined by the 0.236 turn and small candles, no duration); TDF E-9 (a); decision log 2026-10-29: the project owner said "no size filter". | No | — |
| 2 | Cypher D far beyond 0.786 (`2026-10-28-formation-cyp.md`) | Varsayım: no D limit, no new exclusion, verdict unchanged. The stop is fixed at the entry. | CYP-07 (complete at the first touch); CYP `## Handel` Stop E-8 (a) (1.382 of fib C → D, never moves) and "Ziele nachziehen" (only the targets follow a new extreme). | Yes: `cypChecks.ts` `drawingsOf`, Z-CYP-03 stop level from C → entry level, not from the farthest wick. | — |
| 3 | UI per variant, Butterfly and Crab (`2026-10-28-formation-but-crb.md`) | Done by PR #278 (variant A, `Check.inactive`). Closed. | Project owner 2026-11-01 (variant A); BUT has no variant pair. | No | — |
| 4 | T618/ENC/KEI minimum size and channel tolerance (`2026-10-28-formation-t618-enc-kei.md`) | No size filter. Channel touch tolerance 0 (a wick beyond the copy without a close counts). The code already does this. Closed. | Decision log 2026-10-29; ENC-04 → TRD-40 (tolerance 0, assumption of the project owner 2026-10-20). | No | — |
| 5 | Five acceptance cases (`2026-11-02-formation-acceptance-fixtures.md`) | `trd-line-h4-01`: the list is right, diagnose the code. `frz-support-h4-01`: the list is right, `nearAtr` 1 → 2 (Varsayım). `frz-resist-h4-02`: the code is right on our candles. `abcd-neg-h4-01`: accept, verdict agrees. `abcd-buy-h4-02`: the rule wins; check first whether our B is a spike. | TRD-34 to TRD-36, TRD-41 (the teacher's own line); FRZ-21 and its DAX example (zone at 1.9 × ATR of D1 counts as near); FRZ-06, FRZ-08; ABCD-06, ABCD-17, SIG-01; FRZ-16, TRD-36. | Yes: tests for all five; `trd.ts` only if the diagnosis finds a defect; `params.ts` `FRZ_PARAMS.nearAtr`; point choice in `abcd.ts` only if B is a spike. | — |
| 6 | SIG-15 exception (`2026-11-02-formation-abcd-16-harmonic.md`) | No connection needed: harmonic patterns are exempt from the veto, and building blocks have no checklist of their own. Closed. | README (building blocks have no checklist); SIG-15, SIG E-4 (a). | No | Q1 |
| 7 | T618 stays "forming" after a touch before the trend change (`2026-11-02-formation-small-findings.md`) | Varsayım: "invalid". | T618-06, T618-07 (the touch is in the correction after the trend-turning impulse); T618 `## Handel` Entry ("no entry in the middle of the turn"). | Yes: `t618Checks.ts` verdict; real series `t618-buy-h4-01`, `tdf-flag-h4-02`. | — |
| 8 | SIG-29 needs a trade (`2026-11-02-formation-sig-warmup-crv.md`) | No connection now. SIG-29 is an entry rule; entry, stop and TP1 are in `## Handel` ("display, no checkbox"). Closed. | README; SIG-29; HDL-02. | No | Q2 |
| 9a | Z-TDF-07 formula (`2026-11-01-formation-display-fixes.md`) | Varsayım: fib with 1 at H1 and 0 at the bowl low; price = low + level × (H1 − low). No impulse start. | Z-TDF-07, TDF E-6 (a); course notes: the inverse fib is drawn downward over the bowl, 2.0 lies above. | Yes: `tdfChecks.ts` Z-TDF-07, tool `fib`, anchors [H1, bowl low]. | — |
| 9b | `formedByD` in `zonesNear` (`2026-11-01-formation-display-fixes.md`) | Varsayım: a zone counts only when its fractal candle closed before D. | GAR-10, BAT-11, BUT-12, CRB-12, CYP-09; FRZ-01 to FRZ-04; CRB-12 (own X zone does not count). | Yes: `xabcd.ts` `zonesNear`, compare the candle end (open + length of `z.tf`) with D. | — |
| 10 | T618 uses the raw line (`2026-11-02-formation-line-trd-measure.md`) | Yes, the TRD line is the rule for T618. | T618-02 ("after TRD-34/TRD-35"), Z-T618-01 ("TRD-34/TRD-35, TRD-40/TRD-42"). | Yes: `t618.ts`, `t618Checks.ts` use `lineThrough`; P only after a release. | — |

## Code changes that follow
Five work packages. Packages in one row of the "parallel" column do not change the same files.

| Package | Items | Files | Parallel with | Note |
|---|---|---|---|---|
| A · T618 line and verdict | 7, 10 | `t618.ts`, `t618Checks.ts`, `formation-t618-lib.spec.ts`, T618 expectations in other specs (`tdf-flag-h4-02`) | B, C | Reads `trd.ts` (`lineThrough`), does not change it. Real series with new expectations need the approval of the project owner. |
| B · Cypher stop anchor | 2 | `cypChecks.ts`, `formation-cyp-lib.spec.ts` | A, C, E | Drawing only; checks and verdict do not change. |
| C · Z-TDF-07 | 9a | `tdfChecks.ts`, `formation-tdf-lib.spec.ts` | A, B, D, E | Drawing only; TDF is not on the page yet. |
| D · `formedByD` | 9b | `xabcd.ts`, `formation-boundaries-lib.spec.ts` | C | Can change zone rows of GAR, BAT, BUT, CRB, CYP in real series, so it can touch `formation-cyp-lib.spec.ts`: run after B, or measure first and start after B if a CYP expectation changes. |
| E · Acceptance cases | 5 | `formation-frz-lib.spec.ts`, `formation-trd-lib.spec.ts`, `formation-abcd-lib.spec.ts`, `params.ts` (`FRZ_PARAMS.nearAtr`); `trd.ts` and `abcd.ts` only after a diagnosis | B, C | If the diagnosis changes `trd.ts`, run it after A, because T618 then uses the changed line. `nearAtr` changes FRZ-21 in other fixtures: measure all fixtures first. |

Every package: a failing test first (`hooks/RULES.md` §8), a mutation of each new branch, measurement over all fixtures in `e2e/fixtures/formation/`, and a journal update in the file of its item.

## Questions for the project owner
- **Q1 (item 6):** The rule book says the SIG-15 veto (Wave divergence at the last two highs → no buy, mirrored for sell) applies to trades with the trend, also at a buy pattern, except harmonic completion, fractal tracking and 2618. Today no pattern applies it. The material says nothing about the page. Do you want a veto row on the non-harmonic patterns (TDF, OBO, CDT, LIB, T618, ENC, KEI) of `/chart?mode=formation`? This is visible UI, so a design comes first.
- **Q2 (item 8):** SIG-29 and HDL-02 need entry, stop and TP1. The rule books show the trade as "display, no checkbox". Do you want a trade block per pattern (entry, stop, TP1, CRV, and SIG-29 when CRV ≤ 1) on the page? This is visible UI, so a design comes first.
- The Varsayım decisions (items 2, 5, 7, 9a, 9b) stay valid until the project owner objects. The number 2 for `nearAtr` (item 5) is the one chosen number in this list.

## Verification
- Each decision was checked against the current code on `main` (v0.7.390): `cypChecks.ts` (Z-CYP-03 anchors at `d`), `lineChannel.ts` (`measureChannel`, no tolerance), `crbChecks.ts` (`inactive`), `sigChecks.ts` (no caller of `analyzeSig` outside the SIG module), `tdfChecks.ts` (Z-TDF-07 as `fibExt` with three anchors), `drawingLayout.ts` (`fibLevelPrice`), `xabcd.ts` (`formedByD` with the open time).
- No code and no test changed in this PR.
