'use client';

import { useId, useState, type ReactNode } from 'react';
import { Check, ChevronDown, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { Drawing } from 'lightweight-charts-drawing';
import ConfirmModal from '@/components/ConfirmModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem, useDropdownClose } from '@/components/ui/dropdown-menu';
import { Modal } from '@/components/ui/modal';
import { FieldLabel, Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { PRESET_ID, isReservedName, presetFibStyle, coeffText, factoryFibStyle, FIB_FONT_SIZES, fibStyleEqual, FIB_KIND, normalizeFibStyle, type FibStyle } from '@/lib/chart-workspace/fibStyle';
import { UNIT_KEYS, UNIT_MAX, barIndexOf, normalizeVisibility, timeAtBar, visibilityForDrawing, type FibVisibility, type UnitKey } from '@/lib/chart-workspace/fibCoords';
import { cn } from '@/lib/utils';
import { NumberBox } from './indicatorControls';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';

const field = 'h-8 rounded-md border border-border bg-popover px-2 text-sm text-foreground disabled:opacity-50';
const k = (key: string) => `fib.${key}` as MessageKey;
const sortTr = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b, 'tr'));

/** `hint` fehlt: der Beschriftungsteil ist selbst ein Kontrollkästchen mit eigenem Hinweis */
function Row({ label, hint, children }: { label: ReactNode; hint?: string; children?: ReactNode }) {
  return <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1">{hint ? <FieldLabel className="w-36 shrink-0 text-sm text-foreground" label={label} hint={hint} /> : <div className="w-36 shrink-0">{label}</div>}<div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div></div>;
}
function Select({ name, value, options, onChange, className }: { name: string; value: string; options: [string, string][]; onChange: (v: string) => void; className?: string }) {
  const t = useT();
  return <Tooltip content={t(k(`${name}.hint`))}><span className="relative inline-flex"><select aria-label={t(k(name))} data-testid={`fib-${name}`} className={cn(field, 'appearance-none truncate pr-7', className)} value={value} onChange={e => onChange(e.target.value)}>{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /></span></Tooltip>;
}
function Swatch({ label, hint, value, onChange, mixed = false, testId }: { label: string; hint: string; value: string; onChange: (v: string) => void; mixed?: boolean; testId?: string }) {
  // Üretim derlemesi renkleri kısaltır (#ffffff → #fff); input[type=color] yalnız uzun biçimi bilir
  const long = value.replace(/^#([\da-f])([\da-f])([\da-f])$/i, '#$1$1$2$2$3$3'), safe = /^#[\da-f]{6}$/i.test(long) ? long : '#808080';
  return <Tooltip content={hint}><span className="relative block size-8 shrink-0 rounded-md border border-muted-foreground/50 p-1 focus-within:ring-2 focus-within:ring-ring"><span className="block size-full rounded-sm border border-black/20" style={{ background: mixed ? 'linear-gradient(135deg, #089981 50%, #f23645 50%)' : safe }} /><input aria-label={label} data-testid={testId} className="absolute inset-0 size-full cursor-pointer opacity-0" type="color" value={safe} onChange={e => onChange(e.target.value)} /></span></Tooltip>;
}

export interface FibSettingsDialogProps {
  /** Açılışta gösterilen sekme (sağ tık menüsü: Görünürlük) */
  initialTab?: 'style' | 'coords' | 'vis';
  drawing: Drawing;
  /** Fiyat ölçeği logaritmik mi (Grafik ayarları → Ölçekler) */
  scaleLog: boolean;
  /** Çizimler kilitli: pencere açılır, alanlar kapalıdır */
  locked: boolean;
  /** Zeiten der geladenen Kerzen (Sekunden, aufsteigend): „Bar“ zählt ab der ersten (1110-A4.7) */
  barTimes: readonly number[];
  /** Kerzendauer des Zeitrahmens; Bar-Nummern außerhalb der geladenen Kerzen werden damit hochgerechnet */
  stepSec: number;
  /** Çizimde hemen göster (geri alma adımı yazmaz) */
  onPreview: (next: Drawing) => void;
  /** Tamam: çizim kaydedilir, geri al geçmişine bir adım girer */
  onCommit: (next: Drawing) => void;
  /** İptal / kapat: ilk hâle dön */
  onCancel: (initial: Drawing) => void;
}

export function FibSettingsDialog({ drawing, initialTab = 'style', scaleLog, locked, barTimes, stepSec, onPreview, onCommit, onCancel }: FibSettingsDialogProps) {
  const t = useT(), id = useId();
  const label = (n: string) => n === PRESET_ID ? t(k('presetName')) : n;
  const templates = useChartWorkspaceStore(s => s.drawingTemplates[FIB_KIND]);
  const store = useChartWorkspaceStore.getState;
  const [initial] = useState(drawing);
  const [name, setName] = useState(drawing.name ?? '');
  const [style, setStyle] = useState<FibStyle>(() => normalizeFibStyle(drawing.style));
  const [tab, setTab] = useState<'style' | 'coords' | 'vis'>(initialTab);
  const [pts, setPts] = useState(() => (drawing.points as { time: number; price: number }[]).slice(0, 2).map(p => ({ time: p.time, price: p.price, bar: barIndexOf(barTimes, p.time, stepSec) })));
  const [vis, setVis] = useState<FibVisibility>(() => normalizeVisibility(drawing.visibility));
  const [renaming, setRenaming] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [applied, setApplied] = useState(() => { const s = normalizeFibStyle(drawing.style); if (fibStyleEqual(s, presetFibStyle())) return PRESET_ID; return Object.entries(templates ?? {}).find(([, v]) => fibStyleEqual(s, v))?.[0] ?? ''; });
  const user = templates ?? {};

  const build = (nextStyle: FibStyle, nextName: string, nextPts = pts, nextVis = vis): Drawing => ({ ...drawing, name: nextName || undefined, style: { ...drawing.style, ...nextStyle }, points: [...nextPts.map(p => ({ time: p.time, price: p.price })), ...drawing.points.slice(nextPts.length)], visibility: visibilityForDrawing(nextVis) } as Drawing);
  const push = (nextStyle: FibStyle, nextName: string) => onPreview(build(nextStyle, nextName));
  const setPoint = (i: number, p: Partial<{ price: number; bar: number }>) => {
    const next = pts.map((q, j) => j !== i ? q : { ...q, ...p, ...(p.bar !== undefined ? { time: timeAtBar(barTimes, p.bar, stepSec) } : {}) });
    setPts(next); onPreview(build(style, name, next));
  };
  const patchVis = (key: UnitKey, p: Partial<FibVisibility[UnitKey]>) => { const next = { ...vis, [key]: { ...vis[key], ...p } }; setVis(next); onPreview(build(style, name, pts, next)); };
  const patchFlag = (key: 'ticks' | 'ranges', v: boolean) => { const next = { ...vis, [key]: v }; setVis(next); onPreview(build(style, name, pts, next)); };
  const patch = (p: Partial<FibStyle>) => { const next = { ...style, ...p }; setStyle(next); setApplied(''); push(next, name); };
  const rename = (v: string) => { setName(v); push(style, v); };
  const adopt = (next: FibStyle, label: string) => { setStyle(next); setApplied(label); setEpoch(e => e + 1); push(next, name); };
  const cancel = () => onCancel(initial);
  const ok = () => { const final = build(style, name.trim()); store().saveDrawingDefault(style); onCommit(final); };

  const setLevel = (i: number, p: Partial<FibStyle['levels'][number]>) => patch({ levels: style.levels.map((l, j) => j === i ? { ...l, ...p } : l) });
  const colors = new Set(style.levels.map(l => l.color.toLowerCase()));
  const extend = ({ 'true,true': 'both', 'true,false': 'left', 'false,true': 'right' } as Record<string, string>)[`${!!style.extendLeft},${!!style.extendRight}`] ?? 'none';
  const lines: [string, string][] = [['solid', '───'], ['dashed', '– – –'], ['dotted', '· · · ·']];
  const px: [string, string][] = [1, 2, 3, 4].map(v => [String(v), `${v} ${t(k('width'))}`]);
  const h3: [string, string][] = [['left', t(k('left'))], ['center', t(k('center'))], ['right', t(k('right'))]];
  const hText: [string, string][] = [['left', t(k('left'))], ['center', t(k('centered'))], ['right', t(k('right'))]];
  const v3: [string, string][] = [['top', t(k('top'))], ['middle', t(k('middle'))], ['bottom', t(k('bottom'))]];
  const title = name.trim() || t(k('title'));

  return <>
    <Modal open onClose={cancel} dismissible={!saveOpen && !deleting} chrome={false} label={title} className="flex h-[min(760px,92dvh)] max-w-lg flex-col p-0">
      <div className="flex min-h-0 flex-1 flex-col" data-testid="fib-settings">
        <div className="flex items-center gap-2 px-5 pt-4">
          {renaming
            ? <input autoFocus aria-label={t(k('objectName'))} data-testid="fib-name" className={cn(field, 'h-9 min-w-0 flex-1 text-base font-semibold')} value={name} maxLength={60} onChange={e => rename(e.target.value)} onBlur={() => setRenaming(false)} onKeyDown={e => { if (e.key === 'Enter') setRenaming(false); }} />
            : <h2 className="min-w-0 truncate text-lg font-semibold" data-testid="fib-title">{title}</h2>}
          <Tooltip content={t(k('rename.hint'))}><button type="button" aria-label={t(k('rename'))} data-testid="fib-rename" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onMouseDown={e => e.preventDefault()} onClick={() => setRenaming(true)}><Pencil className="size-4" aria-hidden="true" /></button></Tooltip>
          <Tooltip content={t(k('close.hint'))} className="ml-auto"><button type="button" aria-label={t(k('close'))} data-testid="fib-close" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={cancel}><X className="size-4" aria-hidden="true" /></button></Tooltip>
        </div>
        <div role="tablist" className="flex gap-5 border-b border-border px-5 pt-2">
          {[{ id: 'style' as const, label: t(k('tab.style')), hint: t(k('tab.style.hint')) }, { id: 'coords' as const, label: t(k('tab.coords')), hint: t(k('tab.coords.hint')) }, { id: 'vis' as const, label: t(k('tab.vis')), hint: t(k('tab.vis.hint')) }].map(x => <Tooltip key={x.id} content={x.hint}><button type="button" role="tab" aria-selected={tab === x.id} data-testid={`fib-tab-${x.id}`} onClick={() => setTab(x.id)} className={cn('-mb-px border-b-2 px-0.5 pb-2 text-sm font-semibold', tab === x.id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground')}>{x.label}</button></Tooltip>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3" role="tabpanel">
          {locked && <p className="mb-2 rounded-md bg-warning/15 px-3 py-2 text-xs text-foreground" data-testid="fib-locked">{t(k('locked'))}</p>}
          <fieldset disabled={locked} className="min-w-0 border-0 p-0">
            {tab === 'style' && <>
            <Row label={<Checkbox className="min-w-0" label={t(k('trendLine'))} hint={t(k('trendLine.hint'))} checked={style.fibTrendLine.visible} onChange={v => patch({ fibTrendLine: { ...style.fibTrendLine, visible: v } })} />}>
              <Swatch label={t(k('trendStyle'))} hint={t(k('trendStyle.hint'))} testId="fib-trend-color" value={style.fibTrendLine.color} onChange={color => patch({ fibTrendLine: { ...style.fibTrendLine, color } })} />
              <Select name="trendWidth" value={String(style.fibTrendLine.width)} options={px} onChange={v => patch({ fibTrendLine: { ...style.fibTrendLine, width: Number(v) } })} className="w-20" />
              <Select name="trendLineStyle" value={style.fibTrendLine.style} options={lines} onChange={v => patch({ fibTrendLine: { ...style.fibTrendLine, style: v as FibStyle['fibTrendLine']['style'] } })} className="w-20" />
            </Row>
            <Row label={t(k('levelLine'))} hint={t(k('lineStyle.hint'))}>
              <Select name="lineStyle" value={style.lineStyle ?? 'solid'} options={lines} onChange={v => patch({ lineStyle: v as FibStyle['lineStyle'] })} className="w-20" />
              <Select name="lineWidth" value={String(style.width)} options={px} onChange={v => patch({ width: Number(v) })} className="w-20" />
            </Row>
            <Row label={t(k('extend'))} hint={t(k('extend.hint'))}>
              <Select name="extend" value={extend} options={(['none', 'left', 'right', 'both'] as const).map(v => [v, t(k(`extend.${v}`))] as [string, string])} onChange={v => patch({ extendLeft: v === 'left' || v === 'both', extendRight: v === 'right' || v === 'both' })} className="w-52 max-w-full" />
            </Row>
            <div className="my-2 grid grid-cols-2 gap-x-4 gap-y-2" data-testid="fib-levels">
              {style.levels.map((lv, i) => <div key={`${i}-${epoch}`} className={cn('flex min-w-0 items-center gap-1.5', !lv.visible && 'opacity-60')} data-testid="fib-level">
                <Tooltip content={t(k('levelOn.hint'))}><input type="checkbox" aria-label={`${t(k('levelOn'))} ${coeffText(lv.coeff)}`} className="size-4 shrink-0 accent-foreground" checked={lv.visible} onChange={e => setLevel(i, { visible: e.target.checked })} /></Tooltip>
                <Tooltip content={t(k('coeff.hint'))} className="min-w-0 flex-1"><input type="number" step="0.001" aria-label={t(k('coeff'))} className={cn(field, 'w-full min-w-0 px-1.5 tabular-nums')} defaultValue={lv.coeff} onChange={e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) setLevel(i, { coeff: v }); }} /></Tooltip>
                <Swatch label={`${t(k('levelColor'))} ${coeffText(lv.coeff)}`} hint={t(k('levelColor.hint'))} value={lv.color} onChange={color => setLevel(i, { color })} />
              </div>)}
            </div>
            <Row label={t(k('oneColor'))} hint={t(k('oneColor.hint'))}>
              <Swatch label={t(k('oneColor'))} hint={t(k('oneColor.hint'))} testId="fib-one-color" mixed={colors.size > 1} value={style.levels[0]?.color ?? '#808080'} onChange={color => { patch({ levels: style.levels.map(l => ({ ...l, color })) }); setEpoch(e => e + 1); }} />
            </Row>
            <Row label={<Checkbox className="min-w-0" label={t(k('background'))} hint={t(k('background.hint'))} checked={!!style.fillBackground} onChange={v => patch({ fillBackground: v })} />}>
              <Tooltip content={t(k('opacity.hint'))}><input type="range" min={0} max={100} aria-label={t(k('opacity'))} data-testid="fib-opacity" className="h-8 w-40 accent-foreground" value={100 - (style.transparency ?? 80)} onChange={e => patch({ transparency: 100 - Number(e.target.value) })} /></Tooltip>
            </Row>
            <div className="min-h-10 py-1.5"><Checkbox label={t(k('reverse'))} hint={t(k('reverse.hint'))} checked={!!style.reverse} onChange={v => patch({ reverse: v })} /></div>
            <div className="min-h-10 py-1.5"><Checkbox label={t(k('prices'))} hint={t(k('prices.hint'))} checked={style.showPrices !== false} onChange={v => patch({ showPrices: v })} /></div>
            <Row label={<Checkbox className="min-w-0" label={t(k('levels'))} hint={t(k('levels.hint'))} checked={style.showCoeffs !== false} onChange={v => patch({ showCoeffs: v })} />}>
              <Select name="valueMode" value={style.fibLevelsAsPercents ? 'pct' : 'val'} options={[['val', t(k('values'))], ['pct', t(k('percents'))]]} onChange={v => patch({ fibLevelsAsPercents: v === 'pct' })} className="w-32" />
            </Row>
            <Row label={t(k('labels'))} hint={t(k('labelH.hint'))}>
              <Select name="labelH" value={style.horzLabelsAlign ?? 'left'} options={h3} onChange={v => patch({ horzLabelsAlign: v as FibStyle['horzLabelsAlign'] })} className="w-24" />
              <Select name="labelV" value={style.vertLabelsAlign ?? 'middle'} options={v3} onChange={v => patch({ vertLabelsAlign: v as FibStyle['vertLabelsAlign'] })} className="w-24" />
            </Row>
            <Row label={<Checkbox className="min-w-0" label={t(k('text'))} hint={t(k('text.hint'))} checked={style.showText !== false} onChange={v => patch({ showText: v })} />}>
              <Select name="textH" value={style.horzTextAlign ?? 'center'} options={hText} onChange={v => patch({ horzTextAlign: v as FibStyle['horzTextAlign'] })} className="w-24" />
              <Select name="textV" value={style.vertTextAlign ?? 'middle'} options={v3} onChange={v => patch({ vertTextAlign: v as FibStyle['vertTextAlign'] })} className="w-24" />
            </Row>
            <Row label={t(k('fontSize'))} hint={t(k('fontSize.hint'))}>
              <Select name="fontSize" value={String(style.labelFontSize ?? 12)} options={FIB_FONT_SIZES.map(v => [String(v), String(v)] as [string, string])} onChange={v => patch({ labelFontSize: Number(v) })} className="w-20" />
            </Row>
            <div className="min-h-10 py-1.5"><Checkbox label={t(k('log'))} hint={t(scaleLog ? k('log.hint') : k('log.off'))} disabled={!scaleLog} checked={scaleLog && !!style.fibLevelsBasedOnLogScale} onChange={v => patch({ fibLevelsBasedOnLogScale: v })} /></div>
            </>}
            {tab === 'coords' && <div data-testid="fib-coords">
              {pts.map((p, i) => <Row key={i} label={t(k('point'), { n: i + 1 })} hint={t(k('point.hint'))}>
                <Tooltip content={t(k(i === 0 ? 'price1.hint' : 'price2.hint'))}><input type="number" step="any" aria-label={t(k('price'), { n: i + 1 })} data-testid={`fib-price-${i + 1}`} className={cn(field, 'w-32 tabular-nums')} defaultValue={p.price} onChange={e => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) setPoint(i, { price: v }); }} /></Tooltip>
                <Tooltip content={t(k('bar.hint'))}><input type="number" step={1} aria-label={t(k('bar'), { n: i + 1 })} data-testid={`fib-bar-${i + 1}`} className={cn(field, 'w-20 tabular-nums')} defaultValue={p.bar} onChange={e => { const v = Math.round(Number(e.target.value)); if (e.target.value !== '' && Number.isFinite(v)) setPoint(i, { bar: v }); }} /></Tooltip>
              </Row>)}
            </div>}
            {tab === 'vis' && <div data-testid="fib-visibility">
              <div className="min-h-11 py-1.5"><Checkbox label={t(k('vis.ticks'))} hint={t(k('vis.noEffect'))} checked={vis.ticks} onChange={v => patchFlag('ticks', v)} /></div>
              {UNIT_KEYS.map(key => { const r = vis[key], max = UNIT_MAX[key], span = (x: number) => ((x - 1) / (max - 1)) * 100;
                return <div key={key} className="flex min-h-11 items-center gap-3" data-visibility={key}>
                  <Checkbox className="w-28 shrink-0" label={t(k(`vis.${key}`))} hint={t(k(key === 'seconds' ? 'vis.noEffect' : `vis.${key}.hint`))} checked={r.on} onChange={on => patchVis(key, { on })} />
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <NumberBox label={t(k(`vis.${key}.from`))} hint={t(k('vis.from.hint'))} className="w-16" value={r.from} min={1} max={r.to} disabled={!r.on} onChange={from => patchVis(key, { from })} />
                    <span aria-hidden="true" className="relative mx-1 h-1.5 min-w-8 flex-1 rounded bg-muted"><span className="absolute inset-y-0 rounded bg-foreground/70" style={{ left: `${span(r.from)}%`, right: `${100 - span(r.to)}%`, opacity: r.on ? 1 : .4 }} /></span>
                    <NumberBox label={t(k(`vis.${key}.to`))} hint={t(k('vis.to.hint'))} className="w-16" value={r.to} min={r.from} max={max} disabled={!r.on} onChange={to => patchVis(key, { to })} />
                  </span>
                </div>; })}
              <div className="min-h-11 py-1.5"><Checkbox label={t(k('vis.ranges'))} hint={t(k('vis.noEffect'))} checked={vis.ranges} onChange={v => patchFlag('ranges', v)} /></div>
            </div>}
          </fieldset>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 py-3">
          <DropdownMenu label={t(k('template'))} hint={t(locked ? k('locked') : k('template.hint'))} side="top" align="left" size="sm" panelClassName="max-h-[60dvh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto" triggerProps={{ disabled: locked, 'data-testid': 'fib-template-menu' }} icon={<span className="inline-flex items-center gap-2">{t(k('template'))}<ChevronDown className="size-3.5" aria-hidden="true" /></span>}>
            <DropdownMenuGroup>
              <DropdownMenuItem data-testid="fib-save-as" icon={<Save className="size-4" aria-hidden="true" />} hint={t(k('saveAs.hint'))} onSelect={() => setSaveOpen(true)}>{t(k('saveAs'))}</DropdownMenuItem>
              <DropdownMenuItem data-testid="fib-apply-defaults" icon={<RotateCcw className="size-4" aria-hidden="true" />} hint={t(k('applyDefaults.hint'))} onSelect={() => adopt(factoryFibStyle(), '')}>{t(k('applyDefaults'))}</DropdownMenuItem>
            </DropdownMenuGroup>
            <div className="my-1 border-t border-border" role="separator" />
            <DropdownMenuGroup className="max-h-56 overflow-y-auto">
              {[PRESET_ID, ...Object.keys(user)].sort((a, b) => label(a).localeCompare(label(b), 'tr')).map(n => n === PRESET_ID
                ? <DropdownMenuItem key={n} data-testid="fib-template-preset" icon={<Check className={cn('size-4', applied !== n && 'opacity-0')} aria-hidden="true" />} hint={t(k('applyPreset.hint'))} onSelect={() => adopt(presetFibStyle(), n)}><span className="flex items-center gap-2">{label(n)}<span className="rounded-full border border-border px-1.5 text-[11px] text-muted-foreground">{t(k('builtin'))}</span></span></DropdownMenuItem>
                : <TemplateRow key={n} name={n} active={applied === n} onApply={() => adopt(normalizeFibStyle(user[n]), n)} onDelete={() => setDeleting(n)} />)}
            </DropdownMenuGroup>
          </DropdownMenu>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" data-testid="fib-cancel" hint={t(k('cancel.hint'))} onClick={cancel}>{t(k('cancel'))}</Button>
            <Button variant="primary" data-testid="fib-ok" hint={t(k('ok.hint'))} onClick={ok}>{t(k('ok'))}</Button>
          </div>
        </div>
      </div>
    </Modal>
    {saveOpen && <SaveTemplateModal id={id} names={Object.keys(user)} onClose={() => setSaveOpen(false)} onSave={n => { store().saveDrawingTemplate(n, style); setApplied(n); setSaveOpen(false); }} />}
    {deleting && <ConfirmModal open title={t(k('deleteTitle'))} message={t(k('deleteMessage'), { name: deleting })} confirmHint={t(k('deleteConfirm.hint'))} variant="danger" onClose={() => setDeleting(null)} onConfirm={() => { store().deleteDrawingTemplate(deleting); if (applied === deleting) setApplied(''); setDeleting(null); }} />}
  </>;
}

function TemplateRow({ name, active, onApply, onDelete }: { name: string; active: boolean; onApply: () => void; onDelete: () => void }) {
  const t = useT(), close = useDropdownClose();
  return <div className="group flex items-center" data-testid="fib-template-row">
    <div className="min-w-0 flex-1"><DropdownMenuItem icon={<Check className={cn('size-4', !active && 'opacity-0')} aria-hidden="true" />} hint={t(k('applyTemplate.hint'))} onSelect={onApply}>{name}</DropdownMenuItem></div>
    <Tooltip content={t(k('deleteTemplate.hint'))}><button type="button" data-testid="fib-template-delete" aria-label={t(k('deleteTemplate'), { name })} className="rounded-md p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => { close(); onDelete(); }}><Trash2 className="size-4" aria-hidden="true" /></button></Tooltip>
  </div>;
}

export function SaveTemplateModal({ id, names, onClose, onSave }: { id: string; names: string[]; onClose: () => void; onSave: (name: string) => void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const n = value.trim(), reserved = isReservedName(n), exists = !reserved && names.includes(n);
  return <Modal open onClose={onClose} title={t(k('saveTitle'))} className="max-w-sm">
    <div data-testid="fib-save-dialog" className="grid gap-3">
      <label htmlFor={`${id}-name`} className="text-sm text-muted-foreground">{t(k('templateName'))}</label>
      <Tooltip content={t(k('templateName.hint'))} className="w-full"><input id={`${id}-name`} autoFocus data-testid="fib-template-name" className={cn(field, 'h-9 w-full')} value={value} maxLength={80} autoComplete="off" onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && n && !reserved) onSave(n); }} /></Tooltip>
      <div className="max-h-36 overflow-y-auto rounded-md border border-border" aria-label={t(k('existing'))}>{sortTr([t(k('presetName')), ...names]).map(x => <Tooltip key={x} content={t(k('pickName.hint'))} className="w-full"><button type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => setValue(x)}>{x}</button></Tooltip>)}</div>
      {reserved && <p className="text-sm text-danger" data-testid="fib-save-warning">{t(k('reserved'))}</p>}
      {exists && <p className="text-sm text-danger" data-testid="fib-save-warning">{t(k('exists'), { name: n })}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" hint={t(k('saveCancel.hint'))} onClick={onClose}>{t(k('cancel'))}</Button>
        <Button variant="primary" data-testid="fib-save-confirm" hint={t(exists ? k('overwrite.hint') : k('save.hint'))} disabled={!n || reserved} onClick={() => onSave(n)}>{t(exists ? k('overwrite') : k('save'))}</Button>
      </div>
    </div>
  </Modal>;
}
