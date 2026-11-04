---
date: 2026-11-05
author: Claude
type: feature
status: open
pr: [365, 366]
features: [FRM-39, FRM-40]
areas: [frontend, tests, docs]
---

# Formation page: trade block and veto row

## Request
A40.2 and A40.3 of the formation plan. SIG-15 (Wave disagrees at the last two highs: no buy) and its mirror SIG-16 are a trade veto in the rule book, but no formation showed it. SIG-29 (CRV at most 1: wait for a reversal candle) and HDL-02 (CRV at least 1) can only be measured when entry, stop and TP1 exist. The owner approved the design on 2026-11-04 ("Önerilerle onay", Artifact boards A to E) and delegated the rest.

## Solution
Phase 1 (PR 365) put the logic in `src/lib/formation/`. Phase 2 (this entry) shows it on `/chart?mode=formation`, tab "Koşullar".

| File | Change |
|---|---|
| `trade.ts`, `tradeApply.ts`, `sigChecks.ts` | `Candidate.trade` (entry, stop, emergency stop, TP1, reasons, `sig29`), `Check.veto`, `tradeSigChecks`. |
| `components/formation/FormationTrade.tsx` | The block: header "Trade · display, not an order" with side, 2 x 2 fields, CRV with a risk/reward bar, veto strip, HDL-02 note, SIG-29 row. |
| `FormationConditions.tsx` | The block sits between the candidate list and the checklist. `digits` comes from the scan. |
| `FormationChecklist.tsx` | The veto row stays in the group "Dışlama" with a "veto" mark. `checkRowState` and `StateIcon` are exported. |
| `CandidateList.tsx` | A "veto" badge next to the verdict pill when the veto is met. Its hint is part of the candidate tooltip. |
| `shotData.ts` | The picture keeps the veto row out: it has no mark there that tells it from an exclusion. |
| `i18n/messages/formation.ts`, `hints.ts` | Labels and hints in tr, en and de. SIG-15, SIG-16 and SIG-29 texts follow board E. |

## Why
- **A40.2.1** The veto does not change the verdict. The verdict does not change (a valid pattern stays valid); alarm, scan and favorites do not change. The strip fades the values instead.
- **A40.2.2** Only TDF, OBO, CDT, LIB, T618, ENC and KEI carry the row. Harmonics and 2618 are exceptions in their rule books.
- **A40.3.3** The SIG-29 row shows at CRV 1 or less, the HDL-02 note at CRV below 1.
- **A40.3.4** Distance is in pips when the symbol has 3 or 5 digits (pip = 10 x point). Otherwise the price difference is shown with `format.price`.
- A missing value shows "—". The line under it names the rule that waits (`wartet auf LIB-04`) or says the rule book gives none (ENC TP1).
- The small texts under each value in the design boards (for example "boyun kırılımı kapanışı") are not built. The label already names the field; the reason text only appears for missing values.

## Verification
- `npx tsc --noEmit`, `npm run lint`.
- `e2e/mocked/formation-trade.spec.ts` (7 tests): block with values, "—" with reason, SIG-29 and HDL-02 at CRV below 1, no veto display for 2618, met veto (strip, row, badge, verdict stays valid), unmet veto, 375 px in light and dark without horizontal scroll. The real H4 series come from `e2e/fixtures/formation`.
- Mocked e2e with the tags `@FRM-*`, `@UI-07`, `@UI-08`: green before the review fixes. Run again after them.

## Open points
- [ ] Owner check on a DEMO account: compare the block with Artifact boards A to D (light and dark, 375 px).
- [ ] CDT entry is empty when only the confirmation candle (CDT-13) is met. The candle index is not available.
- [ ] ENC and KEI are not in `SCAN_FORMATIONS`, so they show no block on the page. They carry `trade` and the veto row in the checker layer.
