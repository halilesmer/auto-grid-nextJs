'use client';

import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { dashOf, type LineKind, type LineStyleSpec, type LineWidth } from '@/lib/formation/lineStyle';
import { cn } from '@/lib/utils';
import { RowColor } from './SettingsDialog';

/** Farbfelder: leer = Rollenfarbe (Theme oder Kerze), dann Grau (Vorgabe der Formationslinien), dann feste Farben */
const COLORS: { value: string; key: MessageKey }[] = [
  { value: 'var(--muted-foreground)', key: 'lineStyle.color.gray' },
  { value: '#16a56b', key: 'lineStyle.color.green' },
  { value: '#d6455d', key: 'lineStyle.color.red' },
  { value: '#2a6df4', key: 'lineStyle.color.blue' },
  { value: '#e0a100', key: 'lineStyle.color.yellow' },
  { value: '#8b5cf6', key: 'lineStyle.color.purple' },
];
const TYPES: LineKind[] = ['solid', 'dashed', 'dotted'];
const WIDTHS: LineWidth[] = [1, 2, 3, 4];

const pill = 'inline-flex h-7 min-w-8 cursor-pointer items-center justify-center rounded-md border border-border px-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  spec: LineStyleSpec;
  onChange: (patch: Partial<LineStyleSpec>) => void;
  /** Bedeutung der leeren Farbe: Themefarbe oder Kerzenfarbe (Trend) */
  auto?: 'theme' | 'candle';
  /** `stack`: Beschriftung über jeder Gruppe (Menü); `inline`: Gruppen nebeneinander, umbrechend (Tabelle) */
  layout?: 'stack' | 'inline';
  /** Nur die Farbe (zweite Trendfarbe im Menü) */
  colorOnly?: boolean;
}

/** Farbe, Typ und Dicke einer Linie. Menü und Einstellungstabelle benutzen diese eine Komponente (Plan 1105-A7). */
export function LineStyleControls({ spec, onChange, auto = 'theme', layout = 'stack', colorOnly = false }: Props) {
  const t = useT();
  const group = (label: MessageKey, children: React.ReactNode) => (
    <div role="group" aria-label={t(label)} className={cn('flex flex-col gap-1', layout === 'stack' ? 'px-2 py-1' : 'min-w-0')}>
      <span className="text-[11px] text-muted-foreground">{t(label)}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
  const autoKey: MessageKey = auto === 'candle' ? 'lineStyle.auto.candle' : 'lineStyle.auto.theme';
  const swatch = (value: string, key: MessageKey) => (
    <Tooltip key={key} content={t(`${key}.hint` as MessageKey)}>
      <button
        type="button"
        aria-label={t(key)}
        aria-pressed={spec.color === value}
        onClick={() => onChange({ color: value })}
        className={cn('size-5 cursor-pointer rounded-md border border-border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', spec.color === value && 'ring-2 ring-primary ring-offset-1 ring-offset-popover')}
        style={value ? { backgroundColor: value } : { backgroundImage: 'repeating-linear-gradient(45deg, var(--card) 0 4px, var(--border) 4px 8px)' }}
      />
    </Tooltip>
  );
  return (
    <div className={cn(layout === 'stack' ? 'flex flex-col' : 'flex flex-wrap items-start gap-x-5 gap-y-2')}>
      {group('lineStyle.color', <>
        {swatch('', autoKey)}
        {COLORS.map(c => swatch(c.value, c.key))}
        <RowColor name="lineStyle.custom" value={spec.color} onChange={v => onChange({ color: v })} />
      </>)}
      {!colorOnly && group('lineStyle.type', TYPES.map(kind => (
        <Tooltip key={kind} content={t(`lineStyle.type.${kind}.hint` as MessageKey)}>
          <button
            type="button"
            aria-label={t(`lineStyle.type.${kind}` as MessageKey)}
            aria-pressed={spec.style === kind}
            onClick={() => onChange({ style: kind })}
            className={cn(pill, 'w-11', spec.style === kind ? 'bg-primary text-primary-foreground' : 'bg-popover text-foreground hover:bg-accent')}
          >
            <svg viewBox="0 0 30 8" className="h-2 w-7" aria-hidden="true"><line x1={2} x2={28} y1={4} y2={4} stroke="currentColor" strokeWidth={2} strokeDasharray={dashOf(kind)} /></svg>
          </button>
        </Tooltip>
      )))}
      {!colorOnly && group('lineStyle.width', WIDTHS.map(n => (
        <Tooltip key={n} content={t('lineStyle.width.option.hint', { n })}>
          <button
            type="button"
            aria-label={t('lineStyle.width.option', { n })}
            aria-pressed={spec.width === n}
            onClick={() => onChange({ width: n })}
            className={cn(pill, spec.width === n ? 'bg-primary text-primary-foreground' : 'bg-popover text-foreground hover:bg-accent')}
          >
            {n}
          </button>
        </Tooltip>
      )))}
    </div>
  );
}
