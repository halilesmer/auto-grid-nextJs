'use client';

import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { useT, type MessageKey } from '@/i18n';
import { COLOR_KEYS, DEFAULT_APPEARANCE, OPTIONS, SETTINGS, type Section, type SettingKey } from '@/lib/chart-workspace/settings';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { appearanceColors } from './runtime';

function settingMax(k: SettingKey) { if (k === 'fontSize') return 24; return k === 'opacity' ? 100 : 35; }
export const fieldClass = 'w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground';
const optionKeys: Record<string, MessageKey> = Object.fromEntries(['auto', 'linear', 'log', 'percent', 'right', 'left', 'solid', 'dashed', 'dotted', 'none', 'off', 'weak', 'strong', 'close', 'open', 'high', 'low', 'chart', 'free', 'setup'].map(k => [k, `cw.option.${k}`])) as Record<string, MessageKey>;
export function Choice({ name, value, options, onChange }: { name: MessageKey; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const t = useT();
  const label = (v: string): string => { if (name === 'cw.template' && (v === 'auto' || v === 'classic')) return t(`cw.${v}`); if (name === 'cw.timeframe') { if (v === '0') return t('cw.option.chart'); return ({ '60': 'M1', '300': 'M5', '900': 'M15', '1800': 'M30', '3600': 'H1', '14400': 'H4', '86400': 'D1' } as Record<string, string>)[v] ?? v; } if (v === 'free' || v === 'setup') return t(`cw.${v}`); if (optionKeys[v]) return t(optionKeys[v]); return v; };
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

export function SettingsDialog({ onClose, overlayContent, rollbackOverlays, commitOverlays, countdownAvailable, ohlcAvailable, defaultMargins }: { onClose: () => void; overlayContent?: ReactNode; rollbackOverlays: () => void; commitOverlays: () => void; countdownAvailable: boolean; ohlcAvailable: boolean; defaultMargins?: { top: number; bottom: number } }) {
  const t = useT(), s = useChartWorkspaceStore();
  const saved = s.preview ?? s.appearance;
  const a = !saved.marginsSet && defaultMargins ? { ...saved, marginTop: defaultMargins.top * 100, marginBottom: defaultMargins.bottom * 100 } : saved;
  const [section, setSection] = useState<Section>('symbol');
  const [template, setTemplate] = useState('auto');
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
  return <Modal open onClose={cancel} title={t('cw.settings')} className="max-h-[90dvh] max-w-4xl overflow-y-auto" >
    <div className="grid min-w-0 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]" data-testid="chart-workspace-settings">
      <nav className="flex flex-wrap content-start gap-1 sm:flex-col" aria-label={t('cw.settings')}>{sections.map(tab => <Button key={tab} size="sm" variant={tab === section ? 'secondary' : 'ghost'} aria-pressed={tab === section} hint={t(`cw.${tab}.hint`)} onClick={() => setSection(tab)}>{t(`cw.${tab}`)}</Button>)}</nav>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">{section === 'overlays' ? <div className="sm:col-span-2">{overlayContent}</div> : (Object.keys(SETTINGS) as SettingKey[]).filter(k => SETTINGS[k][0] === section && (k !== 'countdown' || countdownAvailable) && (ohlcAvailable || (k !== 'ohlc' && k !== 'change'))).map(k => {
        const key = `cw.${k}` as MessageKey, val = a[k];
        if (typeof val === 'boolean') return <Toggle key={k} name={key} checked={val} onChange={v => change(k, v)} />;
        if (COLOR_KEYS.has(k)) return <ColorField key={k} name={key} value={color(k)} onChange={v => change(k, v)} />;
        if (OPTIONS[k]) return <Choice key={k} name={key} value={String(val)} options={OPTIONS[k]} onChange={v => change(k, v)} />;
        return <Numeric key={k} name={key} value={Number(val)} min={k === 'fontSize' ? 10 : 0} max={settingMax(k)} onChange={v => change(k, v)} />;
      })}</div>
    </div>
    <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <Choice name="cw.template" value={template} options={['auto', 'classic', ...Object.keys(s.templates)]} onChange={v => { setTemplate(v); s.setPreview(s.templates[v] ?? { ...DEFAULT_APPEARANCE, border: v === 'classic', preset: v === 'classic' ? 'classic' : 'auto' }); }} />
      <div className="flex min-w-0 items-end gap-2"><InputField label={t('cw.templateName')} hint={t('cw.templateName.hint')} className="min-w-0 flex-1"><input className={fieldClass} value={name} maxLength={80} onChange={e => setName(e.target.value)} /></InputField><Button size="sm" hint={t('cw.saveTemplate.hint')} disabled={!name.trim()} onClick={() => { s.saveTemplate(name, saved); setTemplate(name.trim()); }}>{t('cw.saveTemplate')}</Button></div>
    </div>
    <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="ghost" hint={t('cw.reset.hint')} onClick={() => s.setPreview({ ...DEFAULT_APPEARANCE })}>{t('cw.reset')}</Button><Button variant="outline" hint={t('cw.cancel.hint')} onClick={cancel}>{t('cw.cancel')}</Button><Button variant="primary" hint={t('cw.apply.hint')} onClick={() => { s.setAppearance(saved); commitOverlays(); onClose(); }}>{t('cw.apply')}</Button></div>
  </Modal>;
}
