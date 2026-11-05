---
date: 2026-11-05
author: Claude
type: fix
status: done
pr: []
features: [FRM-06, FRM-08]
areas: [frontend]
---

# Double top: N is the deepest correction low

## Request
A read-only check of the PR 381 test expectations against the local rule book reported defect G2: the automatic double-top
search (CDT) takes N as the first turning point after H1. The task: reproduce the defect with a failing test, then fix it if the
rule book agrees.

## Cause
`selectBases` in `frontend_nextjs/src/lib/formation/cdt.ts` set N to the turning point directly after H1 (`pivots[i + 1]`).
H2 is the outermost wick since N. When the correction between the two tops makes an inner counter move (a lower high and then
a deeper low), the deeper low is between N and H2, but the code did not use it.

The rule book defines N as the correction low between the two tops (reading of the CDT points, CDT-03). TRD-02 sets a turning
point at the wick end of the extreme candle of the section. TRD-13 says that a counter move inside a correction is part of the
correction. Thus N must be the deepest low between H1 and H2.

Reproduction (failing tests before the fix):

| Case | Old N | Rule N | CDT-04 old → new |
|---|---|---|---|
| Synthetic series H1 130, low 116, inner high 124, low 110, H2 129.85 | 116 | 110 | 0.467 → 0.667 |
| Fixture `cdt-top-h4-02` at 2025-10-23 08:00 | 2025-10-21 16:00, 202.566 | 2025-10-22 12:00, 201.915 | 0.551 → 0.929 |

The wrong N goes into CDT-03, CDT-04, the TP1 zone, the drawing Z-CDT-06 and, through 2618, into 2618-02.

## Solution

| File | Change |
|---|---|
| `frontend_nextjs/src/lib/formation/cdt.ts` | New `correctionLow`: N moves to the outermost wick on the side of N between the first turning point after H1 and H2. `selectBases` takes an optional `secondTopOf` that gives the H2 of the caller. The default is the outermost wick since N (as `shapeOn`). |
| `frontend_nextjs/src/lib/formation/f2618Checks.ts` | `analyze2618` gives `secondTop` (the first finished touch of the zone of H1) to `selectBases`, so the correction ends at the 2618 H2. |
| `frontend_nextjs/e2e/mocked/formation-cdt-lib.spec.ts` | New synthetic case with an inner counter move (and its mirror); `cdt-top-h4-02` now checks N and CDT-04 = 0.929; the look-ahead case of `cdt-top-h4-01` is changed (see below). |
| `docs/features/features.yaml` | FRM-06 description and test step name the new N rule. |

Changed expectation (note "CDT-N" in the test): `cdt-top-h4-01` at 2025-10-27 12:00 expected CDT-04 ☐ (depth 0.277). That
value came from the defect: N was 152.47 (2025-10-23 16:00), the correction low between the tops is 152.224
(2025-10-24 12:00), depth 0.493. The test now checks the purpose it had: at the early time the older pair (H1 2025-10-23 12:00)
applies and CDT-15 makes it invalid; the later H1 (2025-10-27 00:00) is not visible yet.

H2 does not change when N moves: the new N is between the old N and H2, and H2 is the outermost wick (CDT) or the first
finished touch of the zone (2618) since the old N.

## Why
- One H2 for each formation. A first version used the CDT H2 (outermost wick) for 2618 too. On `f2618-vol-h4-01` the
  outermost high after N was the 2618 stop point S, after the break below N, so N moved past the real second top and the
  sell case changed to a buy case. With the 2618 H2 the correction ends where 2618 sees the second top, and all 2618 results stay
  the same.
- Own points (`checkCdtCandidate`, `check2618Candidate`) do not change: the user sets N.
- N uses the deepest wick of all candles between the first turning point and H2, not only trend pivots, because TRD-02 sets
  the turning point at the extreme wick of the section.

## Verification
- Before the fix: the two new assertions failed (synthetic N 116 instead of 110; fixture N 202.566 instead of 201.915).
- After the fix: all formation logic tests (`e2e/mocked/formation-*-lib.spec.ts`) pass, also all CDT, 2618, ABCD and scan tests.
- `npx tsc --noEmit`, `npm run lint`, `python scripts/features/update_checklist.py --check` and the full mocked e2e: see the PR.
- Not verified: the source images and a lower time frame (M30) for `cdt-top-h4-02`; the global fixture trend setting is a
  separate decision.

## Lessons
- When a formation point is "the extreme between two other points", measure it between those points. A trend pivot next to
  the first point is only the start of the section.
- When two formations share a point search, give each one its own end point. The same rule with a different H2 gave a
  different formation on a real series.
