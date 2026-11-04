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
 * Zeile darunter (im Raster `bar2` stehen die Zeiteinheiten links in Zeile 2 vor den Formationen). Die Badges zählen Treffer (gültig, oder im Aufbau mit vorletztem Punkt) über alle Zeiteinheiten bzw. Formationen.
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
  // Die Kopfleiste von Setup und Frei bricht um: was nicht mehr vor die Reserve passt, steht in der zweiten Zeile; die Werkzeuge liegen nur in der ersten (37 px).
  // Formation (A13.7): bis 91rem Container ein festes Raster mit zwei Zeilen (Variante `bar2`, globals.css), davor brach die Leiste in zwei Bändern auf drei Zeilen (94 px) um: 48–57rem und 71–88rem (gemessen 2026-11-04, 16 und 20 px Schrift).
  // Schwelle A = 71rem (1136 px): ab A stehen die Werkzeuge in der Kopfleiste, darunter schwebt die Werkzeugleiste unten über dem Chart
  // (mit offener Seitenleiste gilt das bei 16 px Schrift bis 1464 px Fenster, 1136 + 328).
  // Schwelle B = 79rem (nur im Status-Knopf): ab B zeigt der Knopf Pille und Zähler statt nur Symbole (FormationStatusChip.tsx).
  // Ändert sich die Leiste, die Werkzeugleiste oder der Status-Knopf, A (hier, ChartTopBar, ChartWorkspace, TrendToggle, LayersMenu) und B bei 16 und 20 px
  // neu messen, ebenso die Raster-Grenzen 48rem und 91rem (`bar2`, globals.css); der Test UI-14 prüft in allen Modi, dass kein Element der Kopfleiste unter der Werkzeugleiste liegt.
  // Raster (`bar2`: Querformat des Handys UI-15/A8.2, und ab lg bis 91rem Container, A13.7): ein Raster mit zwei Zeilen. Ab 71rem ist Zeile 1 mindestens 38 px hoch und hält rechts 24,25rem für die Werkzeugleiste frei. Zeile 1: Symbol und Konto (Spalte 1–2), Werkzeuge (Spalte 3); Zeile 2: Zeiteinheiten (Spalte 1), Formationen (Spalte 2–3). Kopfleiste und Zeiteinheiten-Block sind dort `contents`, jedes Element bleibt einmal im DOM.
  return (
    <div className="pointer-events-none bg-background bar2:grid bar2:grid-cols-[auto_minmax(0,1fr)_auto] bar2:items-center bar2:gap-x-1 bar2:border-b bar2:border-border bar2:px-2" data-testid="formation-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 bar2:contents lg:min-h-[38px] @min-[71rem]/formation-main:pr-97" data-testid="formation-topbar">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full max-lg:flex-wrap max-lg:py-1 bar2:col-span-2 bar2:col-start-1 bar2:row-start-1 bar2:w-auto bar2:flex-nowrap bar2:py-0.5 bar2:@min-[71rem]/formation-main:min-h-[38px] lg:h-auto lg:flex-nowrap" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block bar2:hidden" aria-hidden="true" />
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full bar2:contents">
          {timeframes !== undefined ? (timeframes && (
            <div className="contents bar2:col-start-1 bar2:row-start-2 bar2:flex bar2:items-center bar2:[&>[data-testid=favorites-timeframes]]:h-7">{timeframes}</div>
          )) : (
          <div role="group" aria-label={t('formation.tf.label')} className="flex h-[38px] min-w-0 items-center gap-0.5 overflow-x-auto max-lg:flex-1 bar2:col-start-1 bar2:row-start-2 bar2:h-7 lg:h-auto">
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
            <div className="contents bar2:col-start-3 bar2:row-start-1 bar2:flex bar2:items-center bar2:gap-1 bar2:@min-[71rem]/formation-main:mr-97">
              <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block bar2:hidden" aria-hidden="true" />
              {actions}
            </div>
          )}
        </div>
      </div>
      {forms !== undefined ? (
        forms && <div className="pointer-events-auto min-w-0 border-b border-border bar2:col-span-2 bar2:col-start-2 bar2:row-start-2 bar2:border-b-0 bar2:[&>[data-testid=favorites-forms]]:min-h-[26px] bar2:[&>[data-testid=favorites-forms]]:flex-nowrap bar2:[&>[data-testid=favorites-forms]]:overflow-x-auto bar2:[&>[data-testid=favorites-forms]]:py-0">{forms}</div>
      ) : (
      <div role="group" aria-label={t('formation.form.label')} className="pointer-events-auto flex h-[30px] min-w-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2 bar2:col-span-2 bar2:col-start-2 bar2:row-start-2 bar2:h-7 bar2:border-b-0 bar2:px-0" data-testid="formation-forms">
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
