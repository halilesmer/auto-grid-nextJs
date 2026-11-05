'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

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
  /** Statistik-Seite: kein Platz für die Werkzeugleiste rechts (sie gibt es dort nicht) */
  flat?: boolean;
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
 * Konto und Ziel (das Ziel hat Inhaltsbreite, höchstens 42 %, das Konto den Rest, Variante C von 04.11.); Modus, Zeitraum und Knöpfe; Zeiteinheiten; Ansicht.
 * Ab lg liegt die Leiste über dem Chart (ChartPage); ab 71 rem lässt sie rechts Platz für die Werkzeuge des ChartWorkspace; Schwelle und Reserve stehen mit
 * der Rechnung in FormationToolbar.tsx. Dort reicht sie Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie), damit die
 * Werkzeuge nicht verdeckt werden.
 */
export function ChartTopBar({ account, mode, target, timeframes, range, view, tools, extra, flat = false }: ChartTopBarProps) {
  const t = useT();
  const [legendOpen, setLegendOpen] = useState(false);
  return (
    <div className="pointer-events-none bg-background short:grid short:grid-cols-[max-content_max-content_minmax(0,1fr)] short:[&_[aria-haspopup]]:max-h-7 short:[&_input]:max-h-7 short:border-b short:border-border" data-testid="chart-topbar">
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 short:contents', !flat && '@min-[71rem]/formation-main:pr-97', '@max-[30rem]/formation-main:gap-x-1')}>
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 max-lg:w-full short:col-span-3 short:w-auto short:flex-nowrap short:border-b short:border-border short:px-2 short:py-0.5', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-1 @max-[30rem]/formation-main:flex-1 @max-[30rem]/formation-main:basis-[56%]">{account}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-3">{mode}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-2 @max-[30rem]/formation-main:flex-[0_1_auto] @max-[30rem]/formation-main:max-w-[42%]">{target}</Slot>
        </div>
        <div className={cn('pointer-events-auto flex min-w-0 max-w-full items-center gap-1 short:px-2 short:py-0', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-6 @max-[30rem]/formation-main:basis-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:w-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:justify-between">{timeframes}</Slot>
        </div>
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 short:flex-nowrap short:px-2 short:py-0', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-4 @max-[30rem]/formation-main:flex-1">{range}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-7">{view}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-5 @max-[30rem]/formation-main:flex @max-[30rem]/formation-main:gap-1">{tools}</Slot>
        </div>
      </div>
      {extra && (
        <div className="pointer-events-auto border-b border-border short:border-b-0 short:@max-[30rem]/formation-main:col-span-3 @max-[30rem]/formation-main:order-8">
          {/* Handy (Container unter 30 rem): ein Knopf „Lejant“ klappt die Schalter darunter auf (Entwurf B vom 05.11.); sonst stehen sie wie früher in der Zeile */}
          <div className="hidden px-2 py-0.5 @max-[30rem]/formation-main:block">
            <Tooltip content={t('analysis.chart.key.toggle.hint')}>
              <button
                type="button"
                aria-expanded={legendOpen}
                onClick={() => setLegendOpen(o => !o)}
                data-testid="chart-legend-toggle"
                className={cn('inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', legendOpen && 'bg-accent')}
              >
                {t('analysis.chart.key.toggle')}
                <ChevronDown aria-hidden className={cn('size-3 transition-transform', legendOpen && 'rotate-180')} />
              </button>
            </Tooltip>
          </div>
          <div className={cn('flex min-h-[30px] items-center gap-x-1 overflow-x-auto px-2 py-0.5 short:min-h-0 short:py-0 short:whitespace-nowrap short:[&_button]:flex-nowrap', '@max-[30rem]/formation-main:min-h-0 @max-[30rem]/formation-main:flex-wrap @max-[30rem]/formation-main:overflow-x-visible @max-[30rem]/formation-main:pt-0', !legendOpen && '@max-[30rem]/formation-main:hidden')}>{extra}</div>
        </div>
      )}
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
