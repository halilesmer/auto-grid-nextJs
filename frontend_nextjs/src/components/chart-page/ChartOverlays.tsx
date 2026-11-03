'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Hinweise und schwebende Karte einer Chartseite. Die Kopfleiste ist so hoch, wie ihre Zeilen umbrechen; deshalb misst die
 * Komponente ihre Unterkante und legt sie als `--chart-top` auf `formation-main`. Hinweise und Karte (ab lg) beginnen darunter.
 * Unter lg liegt die Karte unten über den Werkzeugen des Charts (bottom-8, bei 375 px zwei Zeilen, etwa 7,5 rem hoch).
 */
export function ChartOverlays({ notices, children }: { notices: ReactNode; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('[data-testid="formation-main"]');
    const bar = root?.querySelector<HTMLElement>('[data-testid="chart-topbar"]');
    if (!root || !bar) return;
    const measure = () => root.style.setProperty('--chart-top', `${bar.getBoundingClientRect().bottom - root.getBoundingClientRect().top}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute left-[64px] right-3 top-[calc(var(--chart-top,0px)+0.5rem)] flex min-w-0 flex-col items-start gap-2 sm:right-20">{notices}</div>
      {children}
    </div>
  );
}

/** Ein Hinweis auf dem Chart: fängt Klicks, obwohl die Ebene darunter sie durchreicht */
export function ChartNotice({ children }: { children: ReactNode }) {
  return <div className="pointer-events-auto w-full max-w-md">{children}</div>;
}
