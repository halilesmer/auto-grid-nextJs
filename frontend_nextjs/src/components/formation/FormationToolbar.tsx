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
  // Platz für die Werkzeugleiste des Charts (ChartWorkspace, overlayLayout) rechts in der Kopfleiste. Schwellen und Reserve stehen in rem,
  // weil Kopfleiste und Werkzeuge mit der Browser-Schrift wachsen; in px überlappten sie bei 20 px Schrift (FRM-23).
  // Gemessen 2026-11-02 bei 16 px Schrift, tr/de (20 px in Klammern): Werkzeugleiste 272 px (333) + 4 px Rand rechts (5) = 276 px (338).
  // Der Inhalt der Kopfleiste endet ab Kante von `formation-main` bei 845 px (1011) mit kompaktem Status-Knopf (nur Symbole)
  // und bei 969 px (1170) mit vollem Knopf (Pille und Zähler; FormationStatusChip.tsx).
  // Schwelle A = 71rem (1136 px): 845 + 8 Abstand + 276 = 1129 (20 px: 1359 ≤ 1420). Ab A stehen die Werkzeuge in der Kopfleiste.
  // Reserve 18rem (288 px ≥ 276 + 8): 845 + 288 = 1133 ≤ 1136 (20 px: 1011 + 360 = 1371 ≤ 1420).
  // Schwelle B = 79rem (1264 px, nur im Status-Knopf): 969 + 8 + 276 = 1253; ab B zeigt der Knopf Pille und Zähler (969 + 288 = 1257; 20 px: 1170 + 360 = 1530 ≤ 1580).
  // Unter A schwebt die Werkzeugleiste unten über dem Chart; mit offener Seitenleiste gilt das bei 16 px bis 1464 px Fenster (1136 + 328).
  // Ändert sich die Leiste oder der Status-Knopf, A (hier, ChartWorkspace, TrendToggle) und B (Status-Knopf) bei 16 und 20 px neu messen.
  return (
    <div className="pointer-events-none bg-background" data-testid="formation-toolbar">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 border-b border-border px-2 lg:h-[38px] lg:flex-nowrap @min-[71rem]/formation-main:pr-72" data-testid="formation-topbar">
        <div className="pointer-events-auto flex h-[38px] min-w-0 items-center gap-1 max-lg:w-full lg:h-auto" data-testid="formation-selectors">
          {children}
        </div>
        <span className="mx-1 hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 max-lg:w-full">
          {timeframes !== undefined ? timeframes : (
          <div role="group" aria-label={t('formation.tf.label')} className="flex h-[38px] min-w-0 items-center gap-0.5 overflow-x-auto max-lg:flex-1 lg:h-auto">
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
        forms && <div className="pointer-events-auto border-b border-border">{forms}</div>
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
