'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';
import { hitsCount, SCAN_FORMATIONS, type ScanFormation, type ScanHit } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

export function CountBadge({ count, active }: { count: number; active: boolean }) {
  if (count === 0) return null;
  return (
    <span
      data-testid="hit-badge"
      className={cn(
        'ml-1 inline-block min-w-[14px] rounded-full px-1 text-center text-[10px] font-semibold leading-[14px]',
        active ? 'bg-black/15 text-current' : 'bg-success/15 text-success',
      )}
    >
      {count}
    </span>
  );
}

export const segment = 'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-[5px] px-1.5 text-xs transition-colors';
export const idle = 'text-muted-foreground hover:bg-accent hover:text-foreground';

/**
 * Kopfleiste im TradingView-Stil: `children` (Symbol und Konto) und Zeiteinheiten in der Leiste, Formationen in der
 * Zeile darunter. Die Badges zählen Treffer (gültig, oder im Aufbau mit vorletztem Punkt) über alle Zeiteinheiten bzw. Formationen.
 * Rechts bleibt ab der Container-Schwelle Platz für die Werkzeuge des ChartWorkspace, die dort über der Leiste liegen; die Leiste reicht Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie), damit die Werkzeuge nicht verdeckt werden.
 */
export function FormationToolbar({
  hits,
  tf,
  form,
  onTimeframe,
  onForm,
  actions,
  timeframes,
  forms,
  children,
}: {
  hits: readonly ScanHit[];
  tf: ContextTimeframe;
  form: ScanFormation;
  onTimeframe: (tf: ContextTimeframe) => void;
  onForm: (form: ScanFormation) => void;
  /** Eigener Inhalt statt der Zeiteinheiten bzw. der Formationszeile (Favoriten, FRM-29); null = nicht zeigen, undefined = Standard */
  timeframes?: ReactNode;
  forms?: ReactNode;
  /** Knöpfe hinter den Zeiteinheiten (z. B. Bild der Formation) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  // Platz für die Werkzeugleiste des Charts (ChartWorkspace, overlayLayout) rechts in der Kopfleiste. Schwelle und Reserve stehen in rem,
  // weil Kopfleiste und Werkzeuge mit der Browser-Schrift wachsen; in px überlappten sie bei 20 px Schrift (FRM-23).
  // Gemessen 2026-11-03 (UI-14, e2e chart-one-page.spec.ts), tr/de: Werkzeugleiste mit dem Knopf „Ebenen“ 374 px bei 16 px Schrift (456 px bei 20 px)
  // + 4 px (5 px) Rand rechts des Containers + 8 px Abstand = 386 px (469 px). Die Reserve ist 24,25rem = 388 px (485 px bei 20 px Schrift).
  // Vorher 18rem (288 px, gemessen ohne „Ebenen“): die Leiste deckte bei 1520 px Fenster den Status-Knopf ab (Befund der Prüfung).
  // Die Kopfleiste bricht um (alle drei Modi): was nicht mehr vor die Reserve passt, steht in der zweiten Zeile; die Werkzeuge liegen nur in der ersten (37 px).
  // Schwelle A = 71rem (1136 px): ab A stehen die Werkzeuge in der Kopfleiste, darunter schwebt die Werkzeugleiste unten über dem Chart
  // (mit offener Seitenleiste gilt das bei 16 px Schrift bis 1464 px Fenster, 1136 + 328).
  // Schwelle B = 79rem (nur im Status-Knopf): ab B zeigt der Knopf Pille und Zähler statt nur Symbole (FormationStatusChip.tsx).
  // Ändert sich die Leiste, die Werkzeugleiste oder der Status-Knopf, A (hier, ChartTopBar, ChartWorkspace, TrendToggle, LayersMenu) und B bei 16 und 20 px
  // neu messen; der Test UI-14 prüft in allen Modi, dass kein Element der Kopfleiste unter der Werkzeugleiste liegt.
  return (
    <div className="pointer-events-none bg-background" data-testid="formation-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 short:flex-nowrap lg:min-h-[38px] @min-[71rem]/formation-main:pr-97" data-testid="formation-topbar">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full max-lg:flex-wrap max-lg:py-1 short:w-auto short:flex-nowrap short:py-0.5 lg:h-auto lg:flex-nowrap" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full short:w-auto short:shrink-0 short:[&>[data-testid=favorites-timeframes]]:h-7">
          {timeframes !== undefined ? timeframes : (
          <div role="group" aria-label={t('formation.tf.label')} className="flex h-[38px] min-w-0 items-center gap-0.5 overflow-x-auto max-lg:flex-1 short:h-7 lg:h-auto">
            {CONTEXT_TIMEFRAMES.map((x) => {
              const count = hitsCount(hits, { tf: x });
              return (
                <Tooltip key={x} content={t('formation.tf.option.hint', { tf: x, count })} role="presentation">
                  <button type="button" aria-pressed={x === tf} data-testid={`formation-tf-${x}`} onClick={() => onTimeframe(x)} className={cn(segment, x === tf ? 'bg-accent text-foreground' : idle)}>
                    {x}
                    <CountBadge count={count} active={false} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
          )}
          {actions && (
            <>
              <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
              {actions}
            </>
          )}
        </div>
      </div>
      {forms !== undefined ? (
        forms && <div className="pointer-events-auto border-b border-border short:[&>[data-testid=favorites-forms]]:min-h-[26px] short:[&>[data-testid=favorites-forms]]:flex-nowrap short:[&>[data-testid=favorites-forms]]:overflow-x-auto short:[&>[data-testid=favorites-forms]]:py-0">{forms}</div>
      ) : (
      <div role="group" aria-label={t('formation.form.label')} className="pointer-events-auto flex h-[30px] items-center gap-0.5 overflow-x-auto border-b border-border px-2" data-testid="formation-forms">
        {SCAN_FORMATIONS.map((x) => {
          const count = hitsCount(hits, { form: x });
          const name = t(`formation.form.${x}` as MessageKey);
          return (
            <Tooltip key={x} content={t('formation.form.option.hint', { form: name, count })} role="presentation">
              <button type="button" aria-pressed={x === form} data-testid={`formation-form-${x}`} onClick={() => onForm(x)} className={cn(segment, 'h-6', x === form ? 'bg-primary text-primary-foreground' : idle)}>
                {name}
                <CountBadge count={count} active={x === form} />
              </button>
            </Tooltip>
          );
        })}
      </div>
      )}
    </div>
  );
}
