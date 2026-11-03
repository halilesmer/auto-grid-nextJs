import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ChartPageProps {
  /** Überschrift nur für Screenreader */
  title: string;
  /** Kopfleiste (Konto, Symbol, Seitensteuerungen) */
  topBar: ReactNode;
  /** Chartfläche */
  surface: ReactNode;
  /** Hinweise und Meldungen unter der Kopfleiste (Laden, Fehler) */
  notices: ReactNode;
  /** Schwebende Karte über dem Chart */
  floating: ReactNode;
  /** Seitenpanel (`ChartPanel`), ohne Konto null */
  panel: ReactNode;
  /** Das Panel ist offen: ab lg rückt der Chart zur Seite */
  panelShown: boolean;
  /** Attribute für Tests am Seitenelement */
  pageProps?: Record<`data-${string}`, string | number>;
  /** `data-testid` des Seitenelements; Standard `formation-page` (Aufruf von /formasyon bleibt unverändert) */
  testId?: string;
  /** Unter lg beginnt die Chartfläche unter der Kopfzeile der App (sonst liegen die Bereichsknöpfe eines Indikators unter ihr); Standard aus */
  surfaceBelowNav?: boolean;
}

/**
 * Seitengerüst einer Chartseite: Chart füllt die Seite, darüber liegen Kopfleiste, Hinweise und schwebende Karte, rechts das Seitenpanel.
 */
export function ChartPage({ title, topBar, surface, notices, floating, panel, panelShown, pageProps, testId = 'formation-page', surfaceBelowNav = false }: ChartPageProps) {
  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-card lg:top-(--nav-height) [&:fullscreen]:top-0" data-chart-page="" {...pageProps} data-testid={testId}>
      <h1 className="sr-only">{title}</h1>
      {/* Ab lg schiebt die offene Seitenleiste den Chart nach links (w-10 Leiste + w-72 Panel = right-82, bei 16 px Schrift 328 px), statt ihn zu überdecken; darunter liegt sie über dem Chart. Der Abstand steht in rem wie die beiden Breiten, sonst überdeckt der Chart die Leiste bei größerer Browser-Schrift. Die Leiste ganz rechts bleibt immer frei. Ab lg liegt `formation-main` über der Seitenleiste (z-70): seine Menüs (Alarm, Bild) ragen sonst unter sie, und die Fläche selbst überlappt sie nicht */}
      <div className={cn('@container/formation-main absolute inset-y-0 left-0 right-10 lg:z-[70]', panelShown && 'lg:right-82')} data-testid="formation-main">
      <div className={cn('absolute inset-0', surfaceBelowNav && 'max-lg:top-18')} data-testid="formation-surface">
        {surface}
      </div>
      <div className="pointer-events-none absolute left-[52px] right-0 top-18 z-50 min-w-0 max-lg:has-[[data-testid=formation-alarm-panel]]:z-[70] lg:top-0">
        {topBar}
      </div>
      <div className="pointer-events-none absolute left-[64px] right-3 top-[184px] z-30 flex min-w-0 flex-col items-start gap-2 sm:right-20 lg:top-[136px]">
        {notices}
      </div>
      {floating}
      </div>
      {panel}
    </div>
  );
}
