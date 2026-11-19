---
date: 2026-11-19
author: Claude
type: decision
status: closed
pr: []
features: [NWS-02]
areas: [frontend]
---

# Gold arrow and weekday in the news card

## Request
Halil asked for a gold (XAU) arrow next to the currency arrow on news rows that can move gold, and for the weekday in brackets after "Heute" in the day heading. He approved the design (Artifact) and said: research which currencies matter and do it for all of them.

## Decision
- Gold moves against the US dollar. The gold arrow is the reverse of the dollar direction.
- USD news: direct. The gold arrow is the reverse of the USD arrow.
- EUR, GBP, JPY, CHF, CAD news: indirect, through the dollar index (DXY basket). A currency arrow down means a stronger dollar, so the gold arrow points down. Solid border for direct, dashed border for indirect.
- AUD, NZD, CNY, others: no gold arrow. Their link to gold has no clear direction (risk mood, physical demand).
- Before release the gold arrow is pale, like the currency arrow. No currency arrow, no gold arrow.
- Day heading: "Heute (Donnerstag)", also for Gestern and Morgen. The filter button "Heute" does not change.

## Evidence and limits
- The web search gave the general relation (dollar and US yields against gold, central bank buying as a floor). It gave no figures per currency.
- The choice of the DXY basket is a judgment from the mechanism, not a measurement. A measurement of gold moves after EUR, GBP, JPY, CHF and CAD news would confirm or remove the indirect arrows.

## Code
`goldArrowOf` in `frontend_nextjs/src/lib/news.ts`; chip in `NewsRow.tsx`; `weekday` formatter in `i18n/format.ts`; hints in `i18n/messages/news.ts`; test in `e2e/mocked/news-card.spec.ts` (NWS-02, 13 passed).
