'use client';
import { useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { FILL_ROWS, GRADIENT_ROWS, patchRow, rowStyle, type Tones } from '@/lib/chart-workspace/indicatorStyle';
import type { Indicator, RowKey, RowStyle } from '@/lib/chart-workspace/indicators';
import { cn } from '@/lib/utils';
import { ownColor } from './runtime';

const box = 'h-8 rounded-md border border-border bg-popover text-sm text-foreground';
const CHECKER = 'repeating-conic-gradient(var(--border) 0 25%, var(--muted) 0 50%) 0 0 / 8px 8px';

/** A label (with its hint) on the left and its control on the right, like the TradingView dialog. */
export function Line({ label, hint, muted = false, children }: { label: string; hint: string; muted?: boolean; children: ReactNode }) {
  return <div className="flex min-h-10 items-center justify-between gap-3"><FieldLabel className={cn('text-sm', muted ? 'text-muted-foreground' : 'text-foreground')} label={label} hint={hint} /><div className="flex shrink-0 items-center gap-2">{children}</div></div>;
}
export function Heading({ children }: { children: ReactNode }) { return <p className="mb-0.5 mt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground first:mt-0">{children}</p>; }
export function Check({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <div className="flex min-h-10 items-center"><Checkbox label={label} hint={hint} checked={checked} onChange={onChange} disabled={disabled} /></div>;
}
/** Clamp and round to `step`, as the stored value must be. */
export const clampNumber = (raw: number, min: number, max: number, step: number) => Math.max(min, Math.min(max, Math.round(raw / step) / (1 / step)));
/**
 * Number field. While the user types, the text stays as typed (a valid partial value such as the "8" of "85" is not clamped at once);
 * a valid number goes to the chart live only when it is inside the limits, and the text is brought into the limits on blur or Enter.
 */
export function NumberBox({ label, hint, value, min, max, step = 1, onChange, disabled, className = 'w-36' }: { label: string; hint: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; disabled?: boolean; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = (raw: string) => {
    setText(null);
    if (raw === '' || raw === '-') return;
    const n = Number(raw);
    if (Number.isFinite(n)) onChange(clampNumber(n, min, max, step));
  };
  return <Tooltip content={hint}><input aria-label={label} disabled={disabled} className={cn(box, className, 'px-2.5 text-right tabular-nums disabled:cursor-not-allowed disabled:opacity-50')} type="number" min={min} max={max} step={step} value={text ?? value}
    onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(clampNumber(n, min, max, step)); }}
    onBlur={e => commit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); }} /></Tooltip>;
}
export function SelectBox({ label, hint, value, options, onChange, disabled }: { label: string; hint: string; value: string; options: readonly { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return <Tooltip content={hint}><span className="relative inline-flex"><select aria-label={label} disabled={disabled} className={cn(box, 'w-36 appearance-none truncate pl-2.5 pr-7 disabled:cursor-not-allowed disabled:opacity-50')} value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2 size-4 text-muted-foreground" aria-hidden="true" /></span></Tooltip>;
}
/** Colour field; an empty colour is transparent and shows a checker. `clearable` adds a button that makes it transparent. */
export function ColorBox({ label, hint, value, onChange, clearable = false }: { label: string; hint: string; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  const t = useT(), long = value.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3'), safe = /^#[\da-f]{6}$/i.test(long) ? long : '#808080';
  return <span className="inline-flex items-center gap-1">
    <Tooltip content={hint}><span className="relative block size-8 rounded-md border border-border p-1 focus-within:ring-2 focus-within:ring-ring"><span className="block size-full rounded-sm" style={value ? { backgroundColor: safe } : { background: CHECKER }} /><input aria-label={label} className="absolute inset-0 size-full cursor-pointer opacity-0" type="color" value={safe} onChange={e => onChange(e.target.value)} /></span></Tooltip>
    {clearable && value && <Button size="icon-xs" variant="ghost" hint={t('ind.clearColor.hint')} aria-label={t('ind.clearColor')} onClick={() => onChange('')}><X size={13} aria-hidden="true" /></Button>}
  </span>;
}
const dash = (style: string) => (['dotted', 'dashed'].includes(style) ? style : 'solid');
/** Swatch of a line row: the colour and a short sample of the line. */
function Swatch({ row, line }: { row: RowStyle; line: boolean }) {
  const colour = row.color || row.color2;
  return <span className="flex items-center gap-2"><span className="block size-[18px] rounded" style={colour ? { backgroundColor: colour, opacity: Math.max(.15, row.opacity / 100) } : { background: CHECKER }} />{line && <span className="block w-8" style={{ borderTop: `${row.width}px ${dash(row.lineStyle)} ${colour || 'currentColor'}`, opacity: Math.max(.3, row.opacity / 100) }} />}</span>;
}

/**
 * One row of the style tab: checkbox, label and a button that opens the colour / opacity / width / pattern panel.
 * `extra` is an optional control right of it (the value of a band).
 */
export function StyleRow({ indicator, rowKey, tones, update, extra, opacity = true, labelKey }: { indicator: Indicator; rowKey: RowKey; tones: Tones; update: (change: Partial<Indicator>) => void; extra?: ReactNode; opacity?: boolean; labelKey?: MessageKey }) {
  const t = useT(), row = rowStyle({ ...indicator, color: ownColor(indicator.color) }, rowKey, tones), key = (labelKey ?? `ind.row.${rowKey}`) as MessageKey;
  const fill = FILL_ROWS.includes(rowKey), gradient = GRADIENT_ROWS.includes(rowKey);
  let menuLabel: MessageKey = 'ind.rowStyle';
  if (fill) menuLabel = gradient ? 'ind.fillTop' : 'ind.fillColor';
  const change = (patch: Partial<RowStyle>) => update(patchRow(indicator, rowKey, patch));
  return <div className="flex min-h-11 items-center gap-3" data-style-row={rowKey}>
    <Checkbox className="min-w-0 flex-1" label={t(key)} hint={t(`${key}.hint` as MessageKey)} checked={row.on} onChange={on => change({ on })} />
    <DropdownMenu label={t(menuLabel)} hint={t(fill ? 'ind.fillColor.hint' : 'ind.rowStyle.hint')} variant="outline" size="sm" align="right" panelClassName="w-64 overflow-visible" triggerProps={{ 'data-style-trigger': rowKey }} icon={<Swatch row={row} line={!fill} />}>
      <div className="grid gap-3 p-3">
        {gradient
          ? <>
            <Line label={t('ind.fillTop')} hint={t('ind.fillTop.hint')}><ColorBox label={t('ind.fillTop')} hint={t('ind.fillTop.hint')} value={row.color} onChange={color => change({ color })} clearable /></Line>
            <Line label={t('ind.fillBottom')} hint={t('ind.fillBottom.hint')}><ColorBox label={t('ind.fillBottom')} hint={t('ind.fillBottom.hint')} value={row.color2} onChange={color2 => change({ color2 })} clearable /></Line>
          </>
          : <Line label={t('ind.color')} hint={t('ind.color.hint')}><ColorBox label={t('ind.color')} hint={t('ind.color.hint')} value={row.color} onChange={color => change({ color })} /></Line>}
        {opacity && <Line label={t('ind.opacity')} hint={t('ind.opacity.hint')}><Tooltip content={t('ind.opacity.hint')}><input aria-label={t('ind.opacity')} className="h-8 w-24 accent-foreground" type="range" min={0} max={100} value={row.opacity} onChange={e => change({ opacity: Number(e.target.value) })} /></Tooltip><span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{row.opacity} %</span></Line>}
        {!fill && <>
          <Line label={t('ind.width')} hint={t('ind.width.hint')}><span role="group" aria-label={t('ind.width')} className="flex gap-1">{([1, 2, 3, 4] as const).map(w => <Button key={w} size="xs" variant={row.width === w ? 'primary' : 'outline'} aria-pressed={row.width === w} hint={t('ind.width.hint')} onClick={() => change({ width: w })}>{w}</Button>)}</span></Line>
          <Line label={t('ind.lineStyle')} hint={t('ind.ls.hint')}><span role="group" aria-label={t('ind.lineStyle')} className="flex gap-1">{(['solid', 'dashed', 'dotted'] as const).map(s => <Button key={s} size="xs" variant={row.lineStyle === s ? 'primary' : 'outline'} aria-pressed={row.lineStyle === s} hint={t('ind.ls.hint')} onClick={() => change({ lineStyle: s })}>{t(`ind.ls.${s}`)}</Button>)}</span></Line>
        </>}
      </div>
    </DropdownMenu>
    {extra}
  </div>;
}
