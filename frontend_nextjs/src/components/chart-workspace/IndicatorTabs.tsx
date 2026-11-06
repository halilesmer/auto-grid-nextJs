'use client';
import { AreaChart as AreaIcon, ChartColumn, ChartLine, CircleDot, Spline } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuItem, DropdownMenuGroup } from '@/components/ui/dropdown-menu';
import { useT, type MessageKey } from '@/i18n';
import { rowStyle, STYLE_ROWS, type Tones } from '@/lib/chart-workspace/indicatorStyle';
import { isSystemRsi, PLOT_TYPES, SMOOTHINGS, SOURCES, type Indicator, type PlotType } from '@/lib/chart-workspace/indicators';
import { RSI_PARAMS } from '@/lib/formation/params';
import { Check, ColorBox, Heading, Line, NumberBox, SelectBox, StyleRow } from './indicatorControls';

const TF_LABEL: Record<number, string> = { 60: 'M1', 300: 'M5', 900: 'M15', 1800: 'M30', 3600: 'H1', 14400: 'H4', 86400: 'D1' };
const PLOT_ICON: Record<PlotType, typeof Spline> = { line: ChartLine, stepline: Spline, area: AreaIcon, histogram: ChartColumn, circles: CircleDot };
const BAND_MIN = { upper: (v: Indicator) => v.middle, middle: (v: Indicator) => v.lower, lower: () => 0 };
const BAND_MAX = { upper: () => 100, middle: (v: Indicator) => v.upper, lower: (v: Indicator) => v.middle };
interface TabProps { indicator: Indicator; update: (change: Partial<Indicator>) => void; timeframeSec: number; tones: Tones }

export function InputsTab({ indicator: v, update, timeframeSec }: TabProps) {
  const t = useT(), rsi = v.kind === 'RSI';
  const sourceOptions = SOURCES.map(s => ({ value: s, label: t(`ind.src.${s}` as MessageKey) }));
  const tfs = [60, 300, 900, 1800, 3600, 14400, 86400].filter(s => s > timeframeSec && s % timeframeSec === 0);
  const off = rsi && isSystemRsi(v) && (v.period !== RSI_PARAMS.period || v.source !== 'close' || v.timeframe !== 0);
  return <div data-tab-panel="inputs">
    <Heading>{t(rsi ? 'ind.sec.rsi' : 'ind.sec.general')}</Heading>
    <Line label={t(rsi ? 'ind.rsiLength' : 'cw.period')} hint={t(rsi ? 'ind.rsiLength.hint' : 'cw.period.hint')}><NumberBox label={t(rsi ? 'ind.rsiLength' : 'cw.period')} hint={t(rsi ? 'ind.rsiLength.hint' : 'cw.period.hint')} value={v.period} min={1} max={5000} onChange={period => update({ period })} /></Line>
    {v.kind !== 'ATR' && <Line label={t('ind.source')} hint={t('ind.source.hint')}><SelectBox label={t('ind.source')} hint={t('ind.source.hint')} value={v.source} options={sourceOptions} onChange={source => update({ source: source as Indicator['source'] })} /></Line>}
    {['EWO', 'MACD'].includes(v.kind) && <Line label={t('cw.slow')} hint={t('cw.slow.hint')}><NumberBox label={t('cw.slow')} hint={t('cw.slow.hint')} value={v.slow} min={1} max={5000} onChange={slow => update({ slow })} /></Line>}
    {v.kind === 'MACD' && <Line label={t('cw.signal')} hint={t('cw.signal.hint')}><NumberBox label={t('cw.signal')} hint={t('cw.signal.hint')} value={v.signal} min={1} max={5000} onChange={signal => update({ signal })} /></Line>}
    {v.kind === 'EWO' && <Check label={t('cw.percent')} hint={t('cw.percent.hint')} checked={v.percent} onChange={percent => update({ percent })} />}
    {v.kind === 'BB' && <Line label={t('cw.deviation')} hint={t('cw.deviation.hint')}><NumberBox label={t('cw.deviation')} hint={t('cw.deviation.hint')} value={v.deviation} min={0.1} max={20} step={0.1} onChange={deviation => update({ deviation })} /></Line>}
    {rsi && <Check label={t('cw.divergence')} hint={t('cw.divergence.hint')} checked={v.divergence} onChange={divergence => update({ divergence })} />}
    {rsi && <>
      <Heading>{t('ind.sec.smoothing')}</Heading>
      <Line label={t('ind.smoothType')} hint={t('ind.smoothType.hint')}><SelectBox label={t('ind.smoothType')} hint={t('ind.smoothType.hint')} value={v.smoothing} options={SMOOTHINGS.map(s => ({ value: s, label: t(`ind.sm.${s}` as MessageKey) }))} onChange={smoothing => update({ smoothing: smoothing as Indicator['smoothing'] })} /></Line>
      <Line label={t('ind.smoothLength')} hint={t('ind.smoothLength.hint')} muted={v.smoothing === 'none'}><NumberBox label={t('ind.smoothLength')} hint={t('ind.smoothLength.hint')} value={v.smoothingPeriod} min={1} max={5000} disabled={v.smoothing === 'none'} onChange={smoothingPeriod => update({ smoothingPeriod })} /></Line>
      <Line label={t('ind.bbDeviation')} hint={t('ind.bbDeviation.hint')} muted={v.smoothing !== 'BB'}><NumberBox label={t('ind.bbDeviation')} hint={t('ind.bbDeviation.hint')} value={v.deviation} min={0.1} max={20} step={0.1} disabled={v.smoothing !== 'BB'} onChange={deviation => update({ deviation })} /></Line>
    </>}
    <Heading>{t('ind.sec.calc')}</Heading>
    <Line label={t('ind.timeframe')} hint={t('ind.timeframe.hint')}><SelectBox label={t('ind.timeframe')} hint={t('ind.timeframe.hint')} value={String(v.timeframe > timeframeSec ? v.timeframe : 0)} options={[{ value: '0', label: t('cw.option.chart') }, ...tfs.map(s => ({ value: String(s), label: TF_LABEL[s] }))]} onChange={timeframe => update({ timeframe: Number(timeframe) })} /></Line>
    <Check label={t('ind.waitClose')} hint={t('ind.waitClose.hint')} checked={v.waitClose} disabled={v.timeframe <= timeframeSec} onChange={waitClose => update({ waitClose })} />
    {off && <div role="status" data-testid="formation-rsi-warning" className="mt-3 flex flex-col gap-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm leading-snug"><span>{t('ind.formationWarn')}</span><Button size="sm" variant="outline" className="self-start" hint={t('ind.formationBack.hint')} onClick={() => update({ period: RSI_PARAMS.period, source: 'close', timeframe: 0 })}>{t('ind.formationBack')}</Button></div>}
  </div>;
}

export function StyleTab({ indicator: v, update, tones }: TabProps) {
  const t = useT(), rsi = v.kind === 'RSI';
  const bandValue = (key: 'upper' | 'middle' | 'lower') => <NumberBox label={t(`ind.bandValue.${key}`)} hint={t(`ind.bandValue.${key}.hint`)} className="w-20" value={v[key]} min={BAND_MIN[key](v)} max={BAND_MAX[key](v)} onChange={x => update({ [key]: x })} />;
  const plot = <DropdownMenu label={t('ind.plotType')} hint={t('ind.plotType.hint')} variant="outline" size="sm" align="right" triggerProps={{ 'data-plot-trigger': v.plotType }} icon={(() => { const Icon = PLOT_ICON[v.plotType]; return <span className="inline-flex items-center gap-1.5"><Icon className="size-4" aria-hidden="true" /><span className="sr-only">{t(`ind.plot.${v.plotType}` as MessageKey)}</span></span>; })()}>
    <DropdownMenuGroup>{PLOT_TYPES.map(type => { const Icon = PLOT_ICON[type]; return <DropdownMenuItem key={type} icon={<Icon className="size-4" aria-hidden="true" />} hint={t('ind.plotType.hint')} onSelect={() => update({ plotType: type })}>{t(`ind.plot.${type}` as MessageKey)}{type === v.plotType ? ' ✓' : ''}</DropdownMenuItem>; })}</DropdownMenuGroup>
  </DropdownMenu>;
  const row = (key: Parameters<typeof rowStyle>[1], extra?: React.ReactNode, opacity = true) => <StyleRow key={key} indicator={v} rowKey={key} tones={tones} update={update} extra={extra} opacity={opacity} />;
  return <div data-tab-panel="style">
    <Heading>{t('ind.sec.lines')}</Heading>
    {rsi
      ? <>
        {row('rsi', plot)}
        {row('ma')}
        {STYLE_ROWS.bands.map(k => row(k, bandValue(k)))}
        {STYLE_ROWS.fills.map(k => row(k))}
        {v.smoothing === 'BB' && <div className="mt-2 rounded-lg border border-dashed border-border px-3 pb-1 pt-2" data-group="bollinger"><p className="text-[11px] text-muted-foreground">{t('ind.group.bollinger')}</p>{STYLE_ROWS.bollinger.map(k => row(k))}</div>}
        {v.divergence && <div className="mt-2 rounded-lg border border-dashed border-border px-3 pb-1 pt-2" data-group="divergence"><p className="text-[11px] text-muted-foreground">{t('ind.group.divergence')}</p>{STYLE_ROWS.divergence.map(k => row(k))}</div>}
      </>
      : <>
        {row('rsi', undefined, false)}
        {['EWO', 'MACD'].includes(v.kind) && <Line label={t('ind.negative')} hint={t('ind.negative.hint')}><ColorBox label={t('ind.negative')} hint={t('ind.negative.hint')} value={v.negative || tones.down} onChange={negative => update({ negative })} /></Line>}
        {v.kind === 'MACD' && <Line label={t('ind.signalColor')} hint={t('ind.signalColor.hint')}><ColorBox label={t('ind.signalColor')} hint={t('ind.signalColor.hint')} value={v.maColor || tones.warning} onChange={maColor => update({ maColor })} /></Line>}
      </>}
    <Heading>{t('ind.sec.out')}</Heading>
    <Line label={t('ind.precision')} hint={t('ind.precision.hint')}><SelectBox label={t('ind.precision')} hint={t('ind.precision.hint')} value={String(v.precision)} options={[{ value: '-1', label: t('ind.prec.default') }, ...Array.from({ length: 9 }, (_, n) => ({ value: String(n), label: String(n) }))]} onChange={x => update({ precision: Number(x) })} /></Line>
    <Check label={t('ind.scaleLabels')} hint={t('ind.scaleLabels.hint')} checked={v.labels} onChange={labels => update({ labels })} />
    <Check label={t('ind.statusValues')} hint={t('ind.statusValues.hint')} checked={v.values} onChange={values => update({ values })} />
    <Heading>{t('ind.sec.in')}</Heading>
    <Check label={t('ind.statusInputs')} hint={t('ind.statusInputs.hint')} checked={v.statusInputs} onChange={statusInputs => update({ statusInputs })} />
  </div>;
}

export function VisibilityTab({ indicator: v, update }: TabProps) {
  const t = useT(), vis = v.visibility;
  const unit = (key: 'minute' | 'hour', max: number) => {
    const r = vis[key], set = (patch: Partial<typeof r>) => update({ visibility: { ...vis, [key]: { ...r, ...patch } } });
    const span = (x: number) => ((x - 1) / (max - 1)) * 100;
    return <div key={key} className="flex min-h-11 items-center gap-3" data-visibility={key}>
      <Check label={t(`ind.vis.${key}`)} hint={t(`ind.vis.${key}.hint`)} checked={r.on} onChange={on => set({ on })} />
      <span className="ml-auto flex min-w-0 flex-1 items-center gap-2">
        <NumberBox label={t(`ind.vis.${key}.from`)} hint={t(`ind.vis.${key}.from.hint`)} className="w-14" value={r.from} min={1} max={r.to} disabled={!r.on} onChange={from => set({ from })} />
        <span aria-hidden="true" className="relative mx-2 h-1.5 min-w-8 flex-1 rounded bg-muted"><span className="absolute inset-y-0 rounded bg-foreground/70" style={{ left: `${span(r.from)}%`, right: `${100 - span(r.to)}%`, opacity: r.on ? 1 : .4 }} /></span>
        <NumberBox label={t(`ind.vis.${key}.to`)} hint={t(`ind.vis.${key}.to.hint`)} className="w-14" value={r.to} min={r.from} max={max} disabled={!r.on} onChange={to => set({ to })} />
      </span>
    </div>;
  };
  return <div data-tab-panel="visibility">
    {unit('minute', 59)}{unit('hour', 24)}
    <Check label={t('ind.vis.day')} hint={t('ind.vis.day.hint')} checked={vis.day} onChange={day => update({ visibility: { ...vis, day } })} />
    <p className="mt-2 text-xs text-muted-foreground">{t('ind.vis.note')}</p>
  </div>;
}
