'use client';

import type { ReactNode } from 'react';
import { DockPackage } from '@/components/chart-workspace/dock/DockPackage';
import { useDock } from '@/components/chart-workspace/dock/DockProvider';
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
 * Kopfleiste im TradingView-Stil in zwei Zeilen (UI-17, Plan 1106-A1, Schritt S3). Zeile 1: `children` (Symbol und Konto), Aktionen und die Pakete in Zeile 1 (`DockRow`);
 * Zeile 2: die Pakete in Zeile 2 (`DockRow`), standardmäßig die Zeiteinheiten und die Formationen. Beide sind Pakete (`DockPackage`, Tutamaç, Pfeil-Menü):
 * der Inhalt bleibt, nur der Behälter ändert sich. Das gewählte Element trägt `data-keep` und wandert nie ins Pfeil-Menü. Die Badges zählen Treffer (gültig, oder im Aufbau mit
 * vorletztem Punkt) über alle Zeiteinheiten bzw. Formationen; mit Favoriten (FRM-29) steht deren Ansicht im Paket.
 * Auf dem Handy (Container unter 30 rem, Plan A1.5) gilt die feste Anordnung wie bisher: Zeiteinheiten neben den Aktionen, Formationen darunter, ohne Pakete. Die Zeilen zerfallen dort nicht in Raster.
 * Rechts bleibt ab der Container-Schwelle Platz für die Werkzeuge des ChartWorkspace; die Leiste reicht Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie).
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
  /** Knöpfe in Zeile 1 (z. B. Bild der Formation) */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const dock = useDock();
  // Pakete gelten ab 30 rem Containerbreite; darunter bleibt die feste Handy-Anordnung (A1.5)
  const docked = !!dock && !dock.phone;
  const tfButtons = CONTEXT_TIMEFRAMES.map((x) => {
    const count = hitsCount(hits, { tf: x });
    return (
      <Tooltip key={x} content={t('formation.tf.option.hint', { tf: x, count })} role="presentation">
        <button type="button" aria-pressed={x === tf} data-keep={x === tf ? '' : undefined} data-testid={`formation-tf-${x}`} onClick={() => onTimeframe(x)} className={cn(segment, x === tf ? 'bg-accent text-foreground' : idle)}>
          {x}
          <CountBadge count={count} active={false} />
        </button>
      </Tooltip>
    );
  });
  const formButtons = SCAN_FORMATIONS.map((x) => {
    const count = hitsCount(hits, { form: x });
    const name = t(`formation.form.${x}` as MessageKey);
    return (
      <Tooltip key={x} content={t('formation.form.option.hint', { form: name, count })} role="presentation">
        <button type="button" aria-pressed={x === form} data-keep={x === form ? '' : undefined} data-testid={`formation-form-${x}`} onClick={() => onForm(x)} className={cn(segment, 'h-6', x === form ? 'bg-primary text-primary-foreground' : idle)}>
          {name}
          <CountBadge count={count} active={x === form} />
        </button>
      </Tooltip>
    );
  });
  // Zeiteinheiten: Paket (docked) oder die feste Handy-Anordnung neben den Aktionen
  const phoneTimeframes = <div role="group" aria-label={t('formation.tf.label')} className="flex h-[38px] min-w-0 items-center gap-0.5 overflow-x-auto max-lg:flex-1">{tfButtons}</div>;
  const phoneForms = <div role="group" aria-label={t('formation.form.label')} className="pointer-events-auto flex h-[30px] min-w-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2" data-testid="formation-forms">{formButtons}</div>;
  let timeframesNode: ReactNode = null;
  if (timeframes !== undefined) {
    if (timeframes) {
      timeframesNode = docked
        ? <DockPackage id="timeframes" shrink className="min-w-0 [&>[data-testid=favorites-timeframes]]:h-7">{timeframes}</DockPackage>
        : <div className="contents">{timeframes}</div>;
    }
  } else timeframesNode = docked ? <DockPackage id="timeframes">{tfButtons}</DockPackage> : phoneTimeframes;
  let formsNode: ReactNode = null;
  if (forms !== undefined) {
    if (forms) {
      formsNode = docked
        ? <DockPackage id="formations" shrink className="min-w-0 [&>[data-testid=favorites-forms]]:min-h-[26px] [&>[data-testid=favorites-forms]]:min-w-0 [&>[data-testid=favorites-forms]]:flex-nowrap [&>[data-testid=favorites-forms]]:overflow-x-auto [&>[data-testid=favorites-forms]]:py-0">{forms}</DockPackage>
        : <div className="pointer-events-auto min-w-0 border-b border-border">{forms}</div>;
    }
  } else formsNode = docked ? <DockPackage id="formations" testId="formation-forms">{formButtons}</DockPackage> : phoneForms;
  return (
    <div className="pointer-events-none bg-background" data-testid="formation-toolbar">
      {/* Zeile 1. Querformat des Handys und 48–91rem (bar2): eine Reihe ohne Umbruch; darunter bricht die Auswahl um (Tablet) */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 bar2:flex-nowrap lg:min-h-[38px] lg:flex-nowrap" data-testid="formation-topbar">
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full max-lg:flex-wrap max-lg:py-1 bar2:w-auto bar2:flex-nowrap bar2:py-0.5 bar2:@min-[71rem]/formation-main:min-h-[38px] lg:h-auto lg:flex-nowrap" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block bar2:hidden" aria-hidden="true" />
        {(actions || (!docked && timeframesNode)) && (
          <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full bar2:w-auto">
            {!docked && timeframesNode}
            {actions && <div className="contents">{actions}</div>}
          </div>
        )}
        {/* Satır 1'in paket bölgesi (UI-17): başlıkta kalan genişlik; paket yokken gizli */}
        <DockRow zone="row1" className="bar2:min-h-[38px]" />
      </div>
      {/* Satır 2 (UI-17, S3): paketi yoksa gizli, sürüklerken bırakma yeri olarak görünür; Formation modunun başlığında bulunur */}
      {docked ? <DockRow zone="row2" className="w-full flex-none rounded-none border-b border-border px-2" /> : formsNode}
      {docked && timeframesNode}
      {docked && formsNode}
    </div>
  );
}
