'use client';

import type { ReactNode } from 'react';

/**
 * Hinweise und schwebende Karte einer Chartseite. `ChartPage` misst die Unterkante der Kopfleiste und legt sie als `--chart-top`
 * auf `formation-main`; Hinweise und Karte (ab lg) beginnen darunter.
 * Unter lg liegt die Karte unten über den Werkzeugen des Charts; zugeklappt in einem eigenen Streifen (FloatingCard).
 */
export function ChartOverlays({ notices, children }: { notices: ReactNode; children?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {children}
      {/* Nach der Karte: die Datenqualitäts-Warnung bleibt sichtbar, auch wenn die Karte neben dem Chart steht */}
      <div className="pointer-events-none absolute z-30 left-[64px] right-3 top-[calc(var(--chart-top,0px)+0.5rem)] flex min-w-0 flex-col items-start gap-2 sm:right-20">{notices}</div>
    </div>
  );
}

/** Ein Hinweis auf dem Chart: fängt Klicks, obwohl die Ebene darunter sie durchreicht */
export function ChartNotice({ children }: { children: ReactNode }) {
  return <div className="pointer-events-auto w-full max-w-md empty:hidden">{children}</div>;
}
