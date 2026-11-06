'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { DockRow } from '@/components/chart-workspace/dock/DockRow';
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
 * Misst, ob die Kopfleiste im Raster `bar2` steht (Bedingung wie die Variante in globals.css: Querformat des Handys, oder ab 64rem Fenster und
 * 48rem bis unter 91rem Container `formation-main`). Nur dann steht „Aktionen“ im DOM vor den Zeiteinheiten, damit die Tab-Folge der Sichtreihenfolge
 * folgt (Zeile 1: Auswahl, Aktionen; Zeile 2: Zeiteinheiten, Formationen). In den anderen Layouts steht alles in einer Reihe, dort gilt die alte Reihenfolge.
 * Vor dem Messen (Server, erster Render) gilt die alte Reihenfolge; die Optik ändert sich nie, weil das Raster jedes Element ausdrücklich platziert.
 */
function useBar2(ref: React.RefObject<HTMLElement | null>): boolean {
  const [bar2, setBar2] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const container = el.closest<HTMLElement>('[data-testid="formation-main"]');
    const update = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const short = window.innerHeight <= 30 * rem && window.innerWidth < 64 * rem;
      const width = container ? container.getBoundingClientRect().width / rem : 0;
      setBar2(short || (window.innerWidth >= 64 * rem && width >= 48 && width < 91));
    };
    update();
    const observer = new ResizeObserver(update);
    if (container) observer.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  return bar2;
}

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
  const root = useRef<HTMLDivElement>(null);
  const bar2 = useBar2(root);
  // Die Werkzeuge des Charts reservieren hier keinen Platz mehr (UI-17, Plan 1106-A1, Journal 2026-11-06-free-package-layout): sie sind Pakete, die in der unteren Leiste
  // des Charts, in Zeile 1 (der `DockRow` am Ende der Kopfleiste), oder frei auf dem Chart stehen. Die früheren Reserven (24,25rem, 26rem mit dem Schalter „Formasyon çizimleri“)
  // und die Schwelle 71rem für die Werkzeugleiste entfallen. Die Raster-Grenzen 48rem und 91rem (`bar2`, globals.css) gelten weiter; der Test UI-14 prüft, dass kein Element der Kopfleiste unter einem Paket in Zeile 1 liegt.
  // Raster (`bar2`: Querformat des Handys UI-15/A8.2, und ab lg bis 91rem Container, A13.7): ein Raster mit zwei Zeilen. Zeile 1: Symbol und Konto (Spalte 1), Pakete in Zeile 1 (`DockRow`, Spalte 2), Aktionen (Spalte 3); Zeile 2: Zeiteinheiten (Spalte 1), Formationen (Spalte 2–3). Kopfleiste und Zeiteinheiten-Block sind dort `contents`, jedes Element bleibt einmal im DOM.
  const timeframesNode = (
          timeframes !== undefined ? (timeframes && (
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
          )
  );
  const actionsNode = (
          actions && (
            <div className="contents bar2:col-start-3 bar2:row-start-1 bar2:flex bar2:items-center bar2:gap-1">
              <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block bar2:hidden" aria-hidden="true" />
              {actions}
            </div>
          )
  );
  return (
    <div className="pointer-events-none bg-background bar2:grid bar2:grid-cols-[auto_minmax(0,1fr)_auto] bar2:items-center bar2:gap-x-1 bar2:border-b bar2:border-border bar2:px-2" data-testid="formation-toolbar" ref={root}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 bar2:contents lg:min-h-[38px]" data-testid="formation-topbar">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full max-lg:flex-wrap max-lg:py-1 bar2:col-start-1 bar2:row-start-1 bar2:w-auto bar2:flex-nowrap bar2:py-0.5 bar2:@min-[71rem]/formation-main:min-h-[38px] lg:h-auto lg:flex-nowrap" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block bar2:hidden" aria-hidden="true" />
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full bar2:contents">
          {/* Mit festen Schlüsseln verschiebt React die Knoten, statt sie neu zu bauen: Zustand und offene Menüs bleiben beim Wechsel */}
          {(bar2 ? ['actions', 'timeframes'] : ['timeframes', 'actions']).map((id) => (
            <Fragment key={id}>{id === 'actions' ? actionsNode : timeframesNode}</Fragment>
          ))}
        </div>
        {/* Satır 1'in paket bölgesi (UI-17): başlıkta kalan genişlik; paket yokken gizli */}
        <DockRow zone="row1" className="bar2:col-start-2 bar2:row-start-1 bar2:min-h-[38px]" />
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
