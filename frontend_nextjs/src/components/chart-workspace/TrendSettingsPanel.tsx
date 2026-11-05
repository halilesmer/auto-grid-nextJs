'use client';

import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { FieldLabel } from '@/components/ui/tooltip';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { TREND_LIMITS, TREND_RULES, type TrendRule, type TrendSettings } from '@/lib/formation/params';
import { ewoPairValid } from '@/lib/formation/trdPath';
import { cn } from '@/lib/utils';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

const fieldClass = 'w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';

function Segmented<T extends string | number>({ label, hint, value, options, onChange }: {
  label: string; hint: string; value: T; options: { value: T; label: string; hint: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel label={label} hint={hint} className="text-xs font-medium text-muted-foreground" />
      <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1">
        {options.map((o) => (
          <Button key={o.value} size="sm" variant={o.value === value ? 'secondary' : 'ghost'} aria-pressed={o.value === value} hint={o.hint} onClick={() => onChange(o.value)}>{o.label}</Button>
        ))}
      </div>
    </div>
  );
}

/** Ganze Zahl: Wert wird erst übernommen, wenn die Eingabe in den Grenzen liegt (tippen bleibt möglich). */
function IntField({ name, value, limit, onCommit }: { name: 'ewoFast' | 'ewoSlow' | 'atrPeriod'; value: number; limit: { min: number; max: number }; onCommit: (n: number) => void }) {
  const t = useT();
  const key = `cw.trend.${name}` as MessageKey;
  return (
    <InputField label={t(key)} hint={t(`${key}.hint` as MessageKey)}>
      <NumberInput
        className={fieldClass}
        data-testid={`trend-${name}`}
        value={value}
        min={limit.min}
        max={limit.max}
        step={1}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isInteger(n) && n >= limit.min && n <= limit.max) onCommit(n);
        }}
      />
    </InputField>
  );
}

/** Einstellungen des Trendzugs; Linie und Formationen rechnen damit; gespeichert im Browser. */
export function TrendSettingsPanel() {
  const t = useT(), fmt = useFormat();
  const s = useAnalysisPrefsStore((st) => st.trend);
  const setTrend = useAnalysisPrefsStore((st) => st.setTrend);
  const reset = useAnalysisPrefsStore((st) => st.resetTrend);
  const set = <K extends keyof TrendSettings>(key: K, value: TrendSettings[K]) => setTrend({ [key]: value });
  return (
    <div className="grid min-w-0 gap-4 p-3 text-sm" data-testid="trend-settings-panel">
      <div className="grid gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('cw.trend.group.line')}</h3>
        <InputField label={t('cw.trend.rule')} hint={t('cw.trend.rule.hint')}>
          <select aria-label={t('cw.trend.rule')} data-testid="trend-rule" className={fieldClass} value={s.rule} onChange={(e) => set('rule', e.target.value as TrendRule)}>
            {TREND_RULES.map((r) => <option key={r} value={r}>{t(`cw.trend.rule.${r}` as MessageKey)}</option>)}
          </select>
        </InputField>
        <InputField label={t('cw.trend.minSize')} hint={t('cw.trend.minSize.hint')} className={cn(s.rule === 'welle' && 'opacity-50')}>
          <div className="flex items-center gap-3">
            <input type="range" aria-label={t('cw.trend.minSize')} data-testid="trend-minSize" className="h-6 min-w-0 flex-1 accent-foreground" {...TREND_LIMITS.minSize} disabled={s.rule === 'welle'} value={s.minSize} onChange={(e) => set('minSize', Number(e.target.value))} />
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">{fmt.number(s.minSize)} ATR</span>
          </div>
        </InputField>
        <InputField label={t('cw.trend.ewoRetreat')} hint={t('cw.trend.ewoRetreat.hint')} className={cn(s.rule !== 'filter' && 'opacity-50')}>
          <div className="flex items-center gap-3">
            <input type="range" aria-label={t('cw.trend.ewoRetreat')} data-testid="trend-ewoRetreat" className="h-6 min-w-0 flex-1 accent-foreground" {...TREND_LIMITS.ewoRetreat} disabled={s.rule !== 'filter'} value={s.ewoRetreat} onChange={(e) => set('ewoRetreat', Number(e.target.value))} />
            <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums">{fmt.number(s.ewoRetreat, { minimumFractionDigits: 1 })}</span>
          </div>
        </InputField>
        <Segmented<number>
          label={t('cw.trend.closes')} hint={t('cw.trend.closes.hint')} value={s.changeCloses} onChange={(v) => set('changeCloses', v)}
          options={[1, 2].map((n) => ({ value: n, label: t(`cw.trend.closes.${n}` as MessageKey), hint: t(`cw.trend.closes.${n}.hint` as MessageKey) }))}
        />
        <div className="grid grid-cols-3 gap-2">
          <IntField name="ewoFast" value={s.ewoFast} limit={TREND_LIMITS.ewoFast} onCommit={(n) => set('ewoFast', n)} />
          <IntField name="ewoSlow" value={s.ewoSlow} limit={TREND_LIMITS.ewoSlow} onCommit={(n) => set('ewoSlow', n)} />
          <IntField name="atrPeriod" value={s.atrPeriod} limit={TREND_LIMITS.atrPeriod} onCommit={(n) => set('atrPeriod', n)} />
        </div>
        {!ewoPairValid(s) && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs" data-testid="trend-ewo-invalid">{t('cw.trend.ewoInvalid')}</p>}
      </div>
      <div><Button size="sm" variant="outline" hint={t('cw.trend.reset.hint')} data-testid="trend-reset" onClick={reset}>{t('cw.trend.reset')}</Button></div>
    </div>
  );
}
