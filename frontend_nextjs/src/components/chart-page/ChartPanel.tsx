import type { ReactNode } from 'react';

/**
 * Seitenpanel einer Chartseite: schmale Leiste ganz rechts (`strip`, immer sichtbar) und daneben das Panel (`children`), wenn `open`.
 * Unter lg liegt das Panel über dem Chart, ab lg schiebt `ChartPage` den Chart zur Seite (Prop `panelShown`, muss bei offenem Panel gesetzt sein). Die Breiten w-10 und w-72 sind in `ChartPage` als right-10 und lg:right-82 festgehalten.
 */
export function ChartPanel({ strip, open, children }: { strip: ReactNode; open: boolean; children: ReactNode }) {
  return (
    <>
      <div className="absolute inset-y-0 right-0 z-[60] flex w-10 flex-col items-center gap-0.5 border-l border-border bg-background pt-18 lg:pt-0" data-testid="favorites-strip">
        {strip}
      </div>
      {open && (
        <div className="absolute inset-y-0 right-10 z-[60] w-72 border-l border-border bg-background pt-18 lg:pt-0" data-testid="formation-sidebar">
          {children}
        </div>
      )}
    </>
  );
}
