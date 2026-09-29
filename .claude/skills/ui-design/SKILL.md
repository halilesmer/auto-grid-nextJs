---
name: ui-design
description: Design and UI rules for the Auto Grid frontend (frontend_nextjs). Use whenever you create or change a visible part of the web UI — a new component, page, dialog, form field, button, metric tile, zone card, chart overlay, layout or styling/Tailwind change — or when the user asks to make the UI look better, cleaner or more consistent ("Design verbessern", "UI aufräumen", "sieht komisch aus"). Takes precedence over generic design skills (e.g. design-skills:design-elevation) for this repo.
---

# Auto Grid UI design

A dense, calm trading dashboard: the user watches bots, zones and P/L and must never misread a
number or trigger a trade by accident. Consistency and legibility beat decoration. Talk to the
user in German.

## 1. Build from the existing parts

Use `src/components/ui/` before writing anything new: `button` (variants `primary | secondary |
outline | ghost | success | danger | warning`, sizes `sm | md | lg | icon | icon-sm`),
`InputField`, `NumberInput`, `switch`, `combobox`, `modal`, `card`, `badge`, `alert`,
`status-dot`, `tooltip`, `animated-tabs`, `animated-toast`, `animate-digits`.
Confirmations go through `ConfirmModal`. Don't add new variants, sizes, or one-off copies of
these; if something is really missing, extend the base component. Icons: `lucide-react`.
Class merging: `cn()` from `@/lib/utils`.

## 2. Colours only via theme tokens

Tokens live in `src/app/globals.css` (`:root` = light, `.dark` = dark; switched through
`useThemeStore`, `dark:` hangs on the `.dark` class). Use the semantic classes:
`bg-background/card/muted/accent`, `text-foreground/muted-foreground`, `border-border`,
`primary` (orange, main action), `secondary` (teal), `success`/`danger`/`warning`/`info`,
charts `--chart-1…5`.

- Never hard-code colours (`text-red-500`, `#hex`, `rgb()`) in components.
- Profit / buy / running = `success`, loss / sell / error / stop = `danger`, waiting / degraded =
  `warning`, neutral info = `info`. Keep this mapping everywhere (cards, charts, logs, badges).
- Soft surfaces: `bg-danger/10 border-danger/30` style, not new tints.
- Check both themes; a new token needs a value in `:root` **and** `.dark`.

## 3. Numbers

- All numbers, prices, lots, percentages and times via `useFormat()` (`src/i18n`); never
  `toFixed`/`toLocaleString` in components.
- Changing figures: `tabular-nums` (or `animate-digits`) so columns don't jitter; right-align
  numeric columns.
- Sign and colour together for P/L (don't rely on colour alone, see §7).

## 4. Text, tooltips, i18n (enforced by tsc and e2e)

- No hard-coded visible strings: key in `src/i18n/messages/<area>.ts` with tr/en/de, then `useT()`.
- Every field, switch, button, tab item and `ConfirmModal` needs `hint` → key `<label-key>.hint`
  in `src/i18n/messages/hints.ts`: what it does, unit/effect, and why it is disabled if so.
  No native `title=`. A bare `<button>`/`<input>` fails UI-07.
- German/Turkish strings are ~30 % longer than English: design for the longest one (truncate +
  tooltip rather than overflow).

## 5. Layout and density

- Must work at 375 px width without horizontal scroll (UI-08): `min-w-0` on flex children,
  `flex-wrap`, `overflow-x-auto` only inside tab bars/tables.
- Spacing on the Tailwind 4-px scale (`gap-2/3/4`, `p-3/4`); radius from `--radius`
  (`rounded-lg`/`rounded-xl`), don't mix others.
- Group related settings in cards with a short heading; primary action right/bottom, one
  `primary` button per area.
- Dialogs use `modal` (renders via portal into `body`); don't build fixed overlays yourself.

## 6. Trading safety in the UI

- Actions that open/close positions, delete zones or stop bots: `danger`/`warning` variant plus
  `ConfirmModal` that names the account and whether it is LIVE or DEMO.
- Show loading (`Button loading`), disabled state with reason in the hint, and errors via toast
  (`apiError`) — never silent failure.
- Live values show their freshness (status dot / last update) when the WebSocket drops.

## 7. Accessibility

- Contrast ≥ 4.5:1 for text in both themes; focus ring via `ring` token stays visible.
- Status never by colour alone: icon, sign or label too.
- Icon-only buttons need an aria-label (the hint doesn't replace it).
- Keyboard: every action reachable with Tab/Enter/Escape.

## 8. Charts

`lightweight-charts` (`src/components/chart/`, `ChartViewer.tsx`): the chart can't use Tailwind
classes. Existing code still has literal colours; for new code read the CSS tokens at runtime
(`getComputedStyle`) and re-apply them on theme change, keeping the §2 colour mapping. For new chart types, stat tiles or KPI
rows also load the `dataviz` skill.

## 9. Tests and state

- Stable `data-testid`/aria attributes on new interactive or data elements.
- New or changed UI feature → entry in `docs/features/features.yaml` + tagged e2e test
  (`/feature-test`, `hooks/RULES.md` §4). Texts in tests via `msg('key')`.
- Components read from the Zustand stores; see `CLAUDE.md` for the store rules.
- New setting in the worker ⇒ matching UI field (UI ↔ backend sync).

## 10. Workflow

1. Look at the neighbouring components and copy their structure.
2. Build; check with `npm run dev:frontend` in the browser pane at desktop width **and** 375 px,
   light **and** dark.
3. `npm run lint` + `npx tsc --noEmit`.
4. For larger UI changes optionally run `design-skills:design-critique` and
   `design-skills:accessibility-audit` on the result, then the `reviewer` agent.
