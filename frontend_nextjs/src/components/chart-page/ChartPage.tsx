'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

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
  /** `data-testid` des Seitenelements; Standard `formation-page` (Modus Formation) */
  testId?: string;
}

/**
 * Seitengerüst einer Chartseite: Chart füllt die Seite, rechts das Seitenpanel. Ab lg liegen Kopfleiste, Hinweise und schwebende Karte
 * über dem Chart. Darunter (Handy, Tablet) steht die Kopfleiste über dem Chart im Fluss (Plan „Ein Chart im System“, Kopfleiste, UI-12):
 * Sie beginnt unter der schwebenden Navigation der App (64 px), der Chart füllt den Rest, und kein Kerzenbereich liegt unter ihr.
 * Die Unterkante der Kopfleiste steht als `--chart-top` auf `formation-main`; Hinweise und Karten beginnen darunter.
 */
export function ChartPage({ title, topBar, surface, notices, floating, panel, panelShown, pageProps, testId = 'formation-page' }: ChartPageProps) {
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrap = bar.current, root = wrap?.closest<HTMLElement>('[data-testid="formation-main"]');
    if (!wrap || !root) return;
    const measure = () => root.style.setProperty('--chart-top', `${wrap.getBoundingClientRect().bottom - root.getBoundingClientRect().top}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-card lg:top-(--nav-height) [&:fullscreen]:top-0" data-chart-page="" {...pageProps} data-testid={testId}>
      <h1 className="sr-only">{title}</h1>
      {/* Ab lg schiebt die offene Seitenleiste den Chart nach links (w-10 Leiste + w-72 Panel = right-82, bei 16 px Schrift 328 px), statt ihn zu überdecken; darunter liegt sie über dem Chart. Der Abstand steht in rem wie die beiden Breiten, sonst überdeckt der Chart die Leiste bei größerer Browser-Schrift. Die Leiste ganz rechts bleibt frei, solange es ein Panel gibt; ohne Panel (Setup, Frei) füllt der Chart die ganze Breite. Ab lg liegt `formation-main` über der Seitenleiste (z-70): seine Menüs (Alarm, Bild) ragen sonst unter sie, und die Fläche selbst überlappt sie nicht */}
      <div className={cn('@container/formation-main absolute inset-y-0 left-0 lg:z-[70]', panel ? 'right-10' : 'right-0', panel && panelShown && 'lg:right-82')} data-testid="formation-main">
      <div className="absolute inset-0 flex flex-col lg:block">
      <div ref={bar} className="pointer-events-none relative z-[53] min-w-0 shrink-0 bg-background max-lg:pt-16 [[data-chart-page]:fullscreen_&]:max-lg:pt-0 max-lg:has-[[data-testid=formation-alarm-panel]]:z-[70] lg:absolute lg:left-[52px] lg:right-0 lg:top-0 lg:bg-transparent">
        {topBar}
      </div>
      <div className="relative min-h-0 flex-1 lg:absolute lg:inset-0" data-testid="formation-surface">
        {surface}
      </div>
      </div>
      <div className="pointer-events-none absolute left-[64px] right-3 top-[calc(var(--chart-top,0px)+0.5rem)] z-30 flex min-w-0 flex-col items-start gap-2 sm:right-20 lg:top-[136px]">
        {notices}
      </div>
      {floating}
      </div>
      {panel}
    </div>
  );
}
