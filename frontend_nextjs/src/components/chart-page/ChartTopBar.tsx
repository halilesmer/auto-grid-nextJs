'use client';

import type { ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { useChartMode } from '@/hooks/useChartMode';
import { useT, type MessageKey } from '@/i18n';
import { CHART_MODES } from '@/lib/chart/mode';
import { cn } from '@/lib/utils';

/** Was die Seite /chart zur Kopfleiste und zu den Hinweisen der Chart-Ansicht beisteuert (Konto, Modus, Zeitraum, Chart/Statistik) */
export interface ChartChrome {
  account: ReactNode;
  mode: ReactNode;
  /** Setup-Wahl (nur im Setup-Modus) */
  zone: ReactNode;
  range: ReactNode;
  view: ReactNode;
  /** Hinweise der Seite (Brokeruhr, Ladefehler) */
  notices: ReactNode;
}

/** Die Teile der Kopfleiste einer Chartseite; jeder steht in einem eigenen Platz (`Slot`), damit er auf dem Handy umsortiert werden kann */
export interface ChartTopBarProps {
  account: ReactNode;
  mode: ReactNode;
  /** Symbol (frei) oder Setup (Setup-Modus) */
  target: ReactNode;
  timeframes: ReactNode;
  range: ReactNode;
  view: ReactNode;
  /** Knöpfe am Ende (Lizenzhinweis, Anzeige-Schalter) */
  tools: ReactNode;
  /** Legenden-Schalter in der Zeile darunter */
  extra?: ReactNode;
}

/**
 * Platz eines Teils der Kopfleiste. Ab 30 rem Containerbreite ist er unsichtbar (`contents`), die Teile liegen wie früher in ihren
 * Gruppen. Auf dem Handy (Container unter 30 rem; die Messung steht im Journal 2026-11-03-chart-topbar-compact.md) wird er ein Block mit
 * Reihenfolge und Breite. Die Klassen stehen ausgeschrieben, damit Tailwind sie findet.
 */
function Slot({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('contents @max-[30rem]/formation-main:block @max-[30rem]/formation-main:min-w-0', className)}>{children}</div>;
}

/**
 * Kopfleiste einer Chartseite im Stil vom Modus Formation von /chart. Ab 30 rem Containerbreite stehen Konto, Modus und Ziel (Symbol bzw. Setup),
 * Zeiteinheiten sowie Zeitraum, Ansicht und Knöpfe in einer umbrechenden Zeile, `extra` (Legenden-Schalter) in der Zeile darunter.
 * Auf dem Handy (unter 30 rem, Handy-Entwurf „Ein Chart · 03.11.“) stehen sie in vier Zeilen:
 * Konto und Ziel; Modus, Zeitraum und Knöpfe; Zeiteinheiten; Ansicht.
 * Ab lg liegt die Leiste über dem Chart (ChartPage); ab 71 rem lässt sie rechts Platz für die Werkzeuge des ChartWorkspace; Schwelle und Reserve stehen mit
 * der Rechnung in FormationToolbar.tsx. Dort reicht sie Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie), damit die
 * Werkzeuge nicht verdeckt werden.
 */
export function ChartTopBar({ account, mode, target, timeframes, range, view, tools, extra }: ChartTopBarProps) {
  return (
    <div className="pointer-events-none bg-background" data-testid="chart-topbar">
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 @min-[71rem]/formation-main:pr-97', '@max-[30rem]/formation-main:gap-x-1')}>
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 max-lg:w-full', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-1 @max-[30rem]/formation-main:flex-1 @max-[30rem]/formation-main:basis-2/5">{account}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-3">{mode}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-2 @max-[30rem]/formation-main:flex-1 @max-[30rem]/formation-main:basis-2/5">{target}</Slot>
        </div>
        <div className={cn('pointer-events-auto flex min-w-0 max-w-full items-center gap-1', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-6 @max-[30rem]/formation-main:basis-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:w-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:justify-between">{timeframes}</Slot>
        </div>
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-4 @max-[30rem]/formation-main:flex-1">{range}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-7">{view}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-5 @max-[30rem]/formation-main:flex @max-[30rem]/formation-main:gap-1">{tools}</Slot>
        </div>
      </div>
      {extra && <div className="pointer-events-auto flex min-h-[30px] items-center gap-x-1 overflow-x-auto border-b border-border px-2 py-0.5">{extra}</div>}
    </div>
  );
}

const MODE_BUTTON = 'inline-flex h-6 shrink-0 cursor-pointer items-center rounded-[5px] px-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Moduswahl der einen Chartseite (Formation / Setup / Frei) als Segment der Kopfleiste; das Konto und das Produkt bleiben beim Wechsel */
export function ChartModeSegment({ fill = false }: { fill?: boolean }) {
  const t = useT();
  const { mode, setMode } = useChartMode();
  return (
    <div role="group" aria-label={t('cw.mode')} className={cn('inline-flex h-7 shrink-0 items-center gap-0.5 rounded-lg bg-accent/60 p-0.5', fill && '@max-[30rem]/formation-main:flex @max-[30rem]/formation-main:w-full @max-[30rem]/formation-main:basis-full')} data-testid="chart-mode">
      {CHART_MODES.map((m) => (
        <Tooltip key={m} content={t(`cw.mode.${m}.hint` as MessageKey)} role="presentation">
          <button
            type="button"
            aria-pressed={mode === m}
            data-testid={`chart-mode-${m}`}
            onClick={() => setMode(m)}
            className={cn(MODE_BUTTON, fill && '@max-[30rem]/formation-main:flex-1 @max-[30rem]/formation-main:justify-center', mode === m ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {t(`cw.mode.${m}` as MessageKey)}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
