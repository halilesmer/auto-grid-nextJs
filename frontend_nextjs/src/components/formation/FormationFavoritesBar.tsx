'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { CountBadge, idle, segment } from '@/components/formation/FormationToolbar';
import { useT, type MessageKey } from '@/i18n';
import { CONTEXT_TIMEFRAMES, type ContextTimeframe } from '@/lib/formation/params';
import { formedSummary, timeframeCount, type FormedBySymbol, type ScanFormation } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

/** Kurznamen wie bei TradingView; intern bleiben es die Zeiteinheiten der Erkennung */
const TF_LABEL: Record<ContextTimeframe, string> = { M15: '15m', H1: '1h', H4: '4h', D1: 'D' };
const TF_ORDER = [...CONTEXT_TIMEFRAMES].reverse();

/** Zeitraum-Zeile der Favoriten: schwarze Leiste, die Zahl = Favoriten mit einer gebildeten Formation im Zeitraum. Filtert ohne neue Anfragen. */
export function FavoritesTimeframes({ results, tf, onTimeframe }: {
  results: FormedBySymbol;
  tf: ContextTimeframe;
  onTimeframe: (tf: ContextTimeframe) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t('formation.tf.label')} className="pointer-events-auto flex h-[38px] min-w-0 items-center lg:h-auto" data-testid="favorites-timeframes">
      <div className="flex items-center gap-0.5 rounded-full bg-neutral-900 p-0.5 text-white">
        {TF_ORDER.map((x) => {
          const count = timeframeCount(results, x);
          return (
            <Tooltip key={x} content={t('formation.fav.tf.hint', { tf: TF_LABEL[x], count })} role="presentation">
              <button
                type="button"
                aria-pressed={x === tf}
                data-testid={`fav-tf-${x}`}
                onClick={() => onTimeframe(x)}
                className={cn(segment, 'h-6 rounded-full px-2.5 text-[11px]', x === tf ? 'bg-neutral-600 text-white' : 'text-neutral-300 hover:bg-neutral-700 hover:text-white')}
              >
                {TF_LABEL[x]}
                <CountBadge count={count} active={false} />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/** Formations-Zeile der Favoriten: nur Formationen, die im Zeitraum in mindestens einem Favoriten gebildet sind; die Zahl = Produkte. */
export function FavoritesForms({ results, tf, filter, onForm }: {
  results: FormedBySymbol;
  tf: ContextTimeframe;
  filter: ScanFormation | null;
  onForm: (form: ScanFormation) => void;
}) {
  const t = useT();
  const summary = formedSummary(results, tf);
  return (
    <div role="group" aria-label={t('formation.form.label')} className="flex min-h-[30px] flex-wrap items-center gap-0.5 px-2 py-0.5" data-testid="favorites-forms">
      {summary.length === 0 ? (
        <p className="text-[11px] text-muted-foreground" data-testid="favorites-forms-empty">{t('formation.fav.noForms')}</p>
      ) : (
        summary.map(({ form, symbols }) => {
          const name = t(`formation.form.${form}` as MessageKey);
          return (
            <Tooltip key={form} content={t('formation.fav.form.hint', { form: name, count: symbols.length })} role="presentation">
              <button
                type="button"
                aria-pressed={form === filter}
                data-testid={`fav-form-${form}`}
                onClick={() => onForm(form)}
                className={cn(segment, 'h-6 text-[11px]', form === filter ? 'bg-primary text-primary-foreground' : idle)}
              >
                {name}
                <CountBadge count={symbols.length} active={form === filter} />
              </button>
            </Tooltip>
          );
        })
      )}
    </div>
  );
}
