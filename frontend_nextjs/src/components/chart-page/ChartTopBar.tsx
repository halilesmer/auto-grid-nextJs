'use client';

import type { ReactNode } from 'react';

import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';

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

/**
 * Kopfleiste einer Chartseite im Stil von /formasyon: `selectors` (Konto, Modus, Symbol bzw. Setup), `timeframes` und `actions`
 * stehen in einer umbrechenden Zeile, `extra` (Legenden-Schalter) in der Zeile darunter. Rechts bleibt ab der Container-Schwelle
 * Platz für die Werkzeuge des ChartWorkspace; Schwelle und Reserve stehen mit der Rechnung in FormationToolbar.tsx.
 * Die Leiste reicht Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie), damit die Werkzeuge nicht verdeckt werden.
 */
export function ChartTopBar({ selectors, timeframes, actions, extra }: { selectors: ReactNode; timeframes: ReactNode; actions: ReactNode; extra?: ReactNode }) {
  return (
    <div className="pointer-events-none bg-background" data-testid="chart-topbar">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 @min-[71rem]/formation-main:pr-72">
        <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 max-lg:w-full">{selectors}</div>
        <div className="pointer-events-auto flex min-w-0 max-w-full items-center gap-1">{timeframes}</div>
        <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-1">{actions}</div>
      </div>
      {extra && <div className="pointer-events-auto flex min-h-[30px] flex-wrap items-center gap-x-1 border-b border-border px-2 py-0.5">{extra}</div>}
    </div>
  );
}

/** Modus-Wahl (frei / Setup) als flache Auswahl der Kopfleiste */
export function ChartModeSelect({ value, onChange }: { value: 'free' | 'setup'; onChange: (mode: 'free' | 'setup') => void }) {
  const t = useT();
  return (
    <Tooltip content={t('cw.mode.hint')} role="presentation">
      <select
        aria-label={t('cw.mode')}
        value={value}
        onChange={(e) => onChange(e.target.value as 'free' | 'setup')}
        className="h-[30px] cursor-pointer rounded-md border-0 bg-transparent px-2 text-xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {(['free', 'setup'] as const).map((mode) => (
          <option key={mode} value={mode}>
            {t(`cw.${mode}` as MessageKey)}
          </option>
        ))}
      </select>
    </Tooltip>
  );
}
