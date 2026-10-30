'use client';

import { useId, useState, type ReactNode } from 'react';
import { AlignLeft, CandlestickChart, Check, ChevronDown, Layers, Paintbrush, RotateCcw, Ruler, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { COLOR_KEYS, DEFAULT_APPEARANCE, OPTIONS, SETTINGS_LAYOUT, type Appearance, type Section, type SettingKey, type SettingRow } from '@/lib/chart-workspace/settings';
import { cn } from '@/lib/utils';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { appearanceColors } from './runtime';

function settingMax(k: SettingKey) { if (k === 'fontSize') return 24; return k === 'opacity' ? 100 : 35; }
export const fieldClass = 'w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';
const optionKeys: Record<string, MessageKey> = Object.fromEntries(['auto', 'linear', 'log', 'percent', 'right', 'left', 'solid', 'dashed', 'dotted', 'none', 'off', 'weak', 'strong', 'close', 'open', 'high', 'low', 'chart', 'free', 'setup'].map(k => [k, `cw.option.${k}`])) as Record<string, MessageKey>;
function useOptionLabel(name: MessageKey) {
  const t = useT();
  return (v: string): string => { if (name === 'cw.timeframe') { if (v === '0') return t('cw.option.chart'); return ({ '60': 'M1', '300': 'M5', '900': 'M15', '1800': 'M30', '3600': 'H1', '14400': 'H4', '86400': 'D1' } as Record<string, string>)[v] ?? v; } if (v === 'free' || v === 'setup') return t(`cw.${v}`); if (optionKeys[v]) return t(optionKeys[v]); return v; };
}
export function Choice({ name, value, options, onChange }: { name: MessageKey; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const t = useT(), label = useOptionLabel(name);
  return <InputField label={t(name)} hint={t(`${name}.hint` as MessageKey)}><select aria-label={t(name)} className={fieldClass} value={value} onChange={e => onChange(e.target.value)}>{options.map(v => <option key={v} value={v}>{label(v)}</option>)}</select></InputField>;
}
export function Numeric({ name, value, min = 0, max = 5000, step = 1, onChange }: { name: MessageKey; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void }) {
  const t = useT();
  return <InputField label={t(name)} hint={t(`${name}.hint` as MessageKey)}><input aria-label={t(name)} className={fieldClass} type="number" min={min} max={max} step={step} value={value} onChange={e => { if (e.target.value === '') return; const raw = Number(e.target.value); if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, Math.round(raw / step) / (1 / step)))); }} /></InputField>;
}
export function ColorField({ name, value, onChange }: { name: MessageKey; value: string; onChange: (v: string) => void }) {
  const t = useT();
  return <InputField label={t(name)} hint={t(`${name}.hint` as MessageKey)}><input aria-label={t(name)} className="h-9 w-16 rounded border border-border bg-background p-1" type="color" value={/^#[\da-f]{6}$/i.test(value) ? value : '#808080'} onChange={e => onChange(e.target.value)} /></InputField>;
}
export function Toggle({ name, checked, onChange }: { name: MessageKey; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useT(), id = useId();
  return <Switch id={`${name.replaceAll('.', '-')}-${id}`} label={t(name)} hint={t(`${name}.hint` as MessageKey)} checked={checked} onChange={onChange} />;
}

const rowFieldClass = 'h-8 rounded-md border border-border bg-popover text-sm text-foreground';
function RowSelect({ name, value, options, onChange }: { name: MessageKey; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const t = useT(), label = useOptionLabel(name);
  return <Tooltip content={t(`${name}.hint` as MessageKey)}><span className="relative inline-flex"><select aria-label={t(name)} className={cn(rowFieldClass, 'w-32 appearance-none truncate pl-2.5 pr-7 sm:w-36')} value={value} onChange={e => onChange(e.target.value)}>{options.map(v => <option key={v} value={v}>{label(v)}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></span></Tooltip>;
}
function RowNumber({ name, value, min, max, onChange }: { name: MessageKey; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const t = useT();
  return <Tooltip content={t(`${name}.hint` as MessageKey)}><input aria-label={t(name)} className={cn(rowFieldClass, 'w-20 px-2.5 text-right tabular-nums')} type="number" min={min} max={max} value={value} onChange={e => { if (e.target.value === '') return; const raw = Number(e.target.value); if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, Math.round(raw)))); }} /></Tooltip>;
}
function RowRange({ name, value, onChange }: { name: MessageKey; value: number; onChange: (v: number) => void }) {
  const t = useT();
  return <Tooltip content={t(`${name}.hint` as MessageKey)}><input aria-label={t(name)} className="h-8 w-24 accent-foreground" type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))} /></Tooltip>;
}
function RowColor({ name, value, onChange }: { name: MessageKey; value: string; onChange: (v: string) => void }) {
  // Der Produktions-Build kürzt CSS-Farben (#ffffff → #fff); input[type=color] kennt nur die Langform.
  const long = value.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3');
  const t = useT(), safe = /^#[\da-f]{6}$/i.test(long) ? long : '#808080';
  return <Tooltip content={t(`${name}.hint` as MessageKey)}><span className="relative block size-8 rounded-md border border-border p-1 focus-within:ring-2 focus-within:ring-ring"><span className="block size-full rounded-sm" style={{ backgroundColor: safe }} /><input aria-label={t(name)} className="absolute inset-0 size-full cursor-pointer opacity-0" type="color" value={safe} onChange={e => onChange(e.target.value)} /></span></Tooltip>;
}

const SECTION_ICONS: Record<Section, LucideIcon> = { symbol: CandlestickChart, status: AlignLeft, scales: Ruler, canvas: Paintbrush, overlays: Layers };

export function SettingsDialog({ initialAppearance, onApply, onClose, overlayContent, rollbackOverlays, commitOverlays, countdownAvailable, ohlcAvailable, defaultMargins }: { initialAppearance: Appearance; onApply: (appearance: Appearance) => void; onClose: () => void; overlayContent?: ReactNode; rollbackOverlays: () => void; commitOverlays: () => void; countdownAvailable: boolean; ohlcAvailable: boolean; defaultMargins?: { top: number; bottom: number } }) {
  const t = useT(), s = useChartWorkspaceStore();
  const saved = s.preview ?? initialAppearance;
  const a = !saved.marginsSet && defaultMargins ? { ...saved, marginTop: defaultMargins.top * 100, marginBottom: defaultMargins.bottom * 100 } : saved;
  const [section, setSection] = useState<Section>('symbol');
  const [template, setTemplate] = useState<string>(initialAppearance.preset);
  const [name, setName] = useState('');
  const cancel = () => { s.setPreview(null); rollbackOverlays(); onClose(); };
  const change = (key: SettingKey, value: string | number | boolean) => {
    const next = { ...saved, [key]: value };
    if (key === 'marginTop' || key === 'marginBottom') Object.assign(next, { marginTop: a.marginTop, marginBottom: a.marginBottom, [key]: value, marginsSet: true });
    s.setPreview(next);
  };
  const colors = appearanceColors(a);
  const color = (k: SettingKey): string => {
    const explicit = a[k]; if (typeof explicit === 'string' && explicit) return explicit;
    if (k in colors) return colors[k as keyof typeof colors];
    if (k === 'background' || k === 'statusColor') return colors.background;
    if (k === 'gridColor' || k === 'axisColor' || k === 'separator') return colors.border;
    return colors.text;
  };
  const sections: Section[] = ['symbol', 'status', 'scales', 'canvas', ...(overlayContent ? ['overlays' as const] : [])];
  const available = (k: SettingKey) => (k !== 'countdown' || countdownAvailable) && (ohlcAvailable || (k !== 'ohlc' && k !== 'change'));
  const control = (k: SettingKey) => {
    const key = `cw.${k}` as MessageKey, options = OPTIONS[k];
    if (COLOR_KEYS.has(k)) return <RowColor key={k} name={key} value={color(k)} onChange={v => change(k, v)} />;
    if (options) return <RowSelect key={k} name={key} value={String(a[k])} options={options} onChange={v => change(k, v)} />;
    if (k === 'opacity') return <RowRange key={k} name={key} value={Number(a[k])} onChange={v => change(k, v)} />;
    return <RowNumber key={k} name={key} value={Number(a[k])} min={k === 'fontSize' ? 10 : 0} max={settingMax(k)} onChange={v => change(k, v)} />;
  };
  const rowView = ({ key: k, extras = [], nested }: SettingRow) => {
    const key = `cw.${k}` as MessageKey, hint = t(`${key}.hint` as MessageKey), val = a[k];
    return <div key={k} className={cn('flex min-h-10 flex-wrap items-center justify-end gap-x-2 gap-y-1', nested && 'pl-7')}>
      {typeof val === 'boolean' ? <Checkbox className="min-w-32 flex-1" label={t(key)} hint={hint} checked={val} onChange={v => change(k, v)} /> : <FieldLabel className="min-w-32 flex-1 text-sm text-foreground" label={t(key)} hint={hint} />}
      {typeof val !== 'boolean' && control(k)}
      {extras.map(control)}
    </div>;
  };
  const chooseTemplate = (v: string) => { setTemplate(v); s.setPreview(s.templates[v] ?? { ...DEFAULT_APPEARANCE, border: v === 'classic', preset: v === 'classic' ? 'classic' : 'auto' }); };
  const templateLabel = (v: string) => (v === 'auto' || v === 'classic' ? t(`cw.${v}`) : v);
  const templateHint = (v: string) => (v === 'auto' || v === 'classic' ? t(`cw.${v}.hint`) : t('cw.template.hint'));
  return <Modal open onClose={cancel} title={t('cw.settings')} className="flex h-[min(640px,90dvh)] max-w-3xl flex-col">
    <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col border-t border-border" data-testid="chart-workspace-settings">
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-border p-3 sm:w-56 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r" aria-label={t('cw.settings')}>{sections.map(tab => { const Icon = SECTION_ICONS[tab]; return <Button key={tab} variant="ghost" wrapperClassName="shrink-0 sm:w-full" className={cn('h-10 w-full justify-start gap-3 px-3 text-sm', tab === section && 'bg-accent font-semibold text-foreground')} aria-pressed={tab === section} hint={t(`cw.${tab}.hint`)} onClick={() => setSection(tab)}><Icon className="size-[18px] shrink-0" aria-hidden="true" />{t(`cw.${tab}`)}</Button>; })}</nav>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4">{section === 'overlays' ? overlayContent : SETTINGS_LAYOUT[section].map(group => <section key={group.id} className="mb-5 last:mb-0"><h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`cw.group.${group.id}`)}</h4>{group.rows.filter(row => available(row.key)).map(rowView)}</section>)}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
        <DropdownMenu label={t('cw.template')} hint={t('cw.template.hint')} side="top" align="left" size="sm" panelClassName="max-h-[70dvh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto" icon={<span className="inline-flex items-center gap-2">{t('cw.template')}<ChevronDown className="size-3.5" aria-hidden="true" /></span>}>
          <DropdownMenuGroup className="max-h-48 overflow-y-auto">{['auto', 'classic', ...Object.keys(s.templates)].map(v => <DropdownMenuItem key={v} icon={<Check className={cn('size-4', v !== template && 'opacity-0')} aria-hidden="true" />} hint={templateHint(v)} onSelect={() => chooseTemplate(v)}>{templateLabel(v)}</DropdownMenuItem>)}</DropdownMenuGroup>
          <DropdownMenuGroup className="grid gap-2 p-3"><InputField label={t('cw.templateName')} hint={t('cw.templateName.hint')}><input className={fieldClass} value={name} maxLength={80} onChange={e => setName(e.target.value)} /></InputField><Button size="sm" variant="outline" hint={t('cw.saveTemplate.hint')} disabled={!name.trim()} onClick={() => { s.saveTemplate(name, saved); setTemplate(name.trim()); }}>{t('cw.saveTemplate')}</Button></DropdownMenuGroup>
          <DropdownMenuGroup><DropdownMenuItem icon={<RotateCcw className="size-4" aria-hidden="true" />} hint={t('cw.reset.hint')} onSelect={() => { setTemplate('auto'); s.setPreview({ ...DEFAULT_APPEARANCE }); }}>{t('cw.reset')}</DropdownMenuItem></DropdownMenuGroup>
        </DropdownMenu>
        <div className="flex gap-2"><Button variant="outline" hint={t('cw.cancel.hint')} onClick={cancel}>{t('cw.cancel')}</Button><Button variant="primary" hint={t('cw.apply.hint')} onClick={() => { onApply(saved); s.setPreview(null); commitOverlays(); onClose(); }}>{t('cw.apply')}</Button></div>
      </div>
    </div>
  </Modal>;
}
