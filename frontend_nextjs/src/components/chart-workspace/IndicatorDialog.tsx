'use client';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useT } from '@/i18n';
import { INDICATOR_KINDS, newIndicator, type Indicator } from '@/lib/chart-workspace/indicators';
import { readChartColors } from '@/lib/chartTheme';
import { Choice, ColorField, Numeric, Toggle } from './SettingsDialog';

export function IndicatorDialog({ values, onChange, onClose, timeframeSec }: { values: Indicator[]; onChange: (v: Indicator[]) => void; onClose: () => void; timeframeSec: number }) {
  const t = useT(), colors = readChartColors();
  const update = (id: string, change: Partial<Indicator>) => onChange(values.map(v => v.id === id ? { ...v, ...change } : v));
  return <Modal open onClose={onClose} title={t('cw.indicators')} className="max-h-[90dvh] max-w-4xl overflow-y-auto">
    <div className="flex flex-wrap gap-2">{INDICATOR_KINDS.map(kind => <Button key={kind} size="sm" hint={t(values.length >= 20 ? 'cw.indicatorLimit.hint' : 'cw.add.hint')} disabled={values.length >= 20} onClick={() => onChange([...values, newIndicator(kind)])}>+ {kind}</Button>)}</div>
    <div className="mt-4 space-y-4" data-testid="indicator-instances">{values.map(v => <section key={v.id} className="space-y-3 rounded-lg border border-border p-3" data-indicator={v.kind}>
      <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{v.kind}</strong><div className="flex items-center gap-3"><Toggle name="cw.visible" checked={v.visible} onChange={visible => update(v.id, { visible })} /><Button size="sm" variant="ghost" hint={t('cw.remove.hint')} onClick={() => onChange(values.filter(i => i.id !== v.id))}>{t('cw.remove')}</Button></div></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Numeric name="cw.period" value={v.period} min={1} onChange={period => update(v.id, { period })} />
        {v.kind !== 'ATR' && <Choice name="cw.source" value={v.source} options={['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4']} onChange={source => update(v.id, { source: source as Indicator['source'] })} />}
        <ColorField name="cw.color" value={v.color || colors.info} onChange={color => update(v.id, { color })} />
        {v.kind !== 'EWO' && <Numeric name="cw.width" value={v.width} min={1} max={4} onChange={width => update(v.id, { width: width as Indicator['width'] })} />}
        {['EWO', 'MACD'].includes(v.kind) && <><Numeric name="cw.slow" value={v.slow} min={1} onChange={slow => update(v.id, { slow })} /><ColorField name="cw.negative" value={v.negative || colors.down} onChange={negative => update(v.id, { negative })} /></>}
        {v.kind === 'EWO' && <Toggle name="cw.percent" checked={v.percent} onChange={percent => update(v.id, { percent })} />}
        {v.kind === 'MACD' && <Numeric name="cw.signal" value={v.signal} min={1} onChange={signal => update(v.id, { signal })} />}
        {v.kind === 'BB' && <Numeric name="cw.deviation" value={v.deviation} min={0.1} max={20} step={0.1} onChange={deviation => update(v.id, { deviation })} />}
        {v.kind === 'RSI' && <>
          <Choice name="cw.smoothing" value={v.smoothing} options={['none', 'SMA', 'EMA', 'RMA', 'WMA', 'BB']} onChange={smoothing => update(v.id, { smoothing: smoothing as Indicator['smoothing'] })} />
          {v.smoothing !== 'none' && <><Numeric name="cw.smoothingPeriod" value={v.smoothingPeriod} min={1} onChange={smoothingPeriod => update(v.id, { smoothingPeriod })} /><ColorField name="cw.maColor" value={v.maColor || colors.warning} onChange={maColor => update(v.id, { maColor })} /></>}
          {v.smoothing === 'BB' && <Numeric name="cw.deviation" value={v.deviation} min={0.1} max={20} step={0.1} onChange={deviation => update(v.id, { deviation })} />}
          <Numeric name="cw.upper" value={v.upper} max={100} onChange={upper => update(v.id, { upper: Math.max(v.middle, upper) })} /><Numeric name="cw.middle" value={v.middle} min={v.lower} max={v.upper} onChange={middle => update(v.id, { middle })} /><Numeric name="cw.lower" value={v.lower} max={v.middle} onChange={lower => update(v.id, { lower })} />
          <Toggle name="cw.bands" checked={v.bands} onChange={bands => update(v.id, { bands })} /><Toggle name="cw.backgroundFill" checked={v.background} onChange={background => update(v.id, { background })} /><Toggle name="cw.gradients" checked={v.gradients} onChange={gradients => update(v.id, { gradients })} /><Toggle name="cw.divergence" checked={v.divergence} onChange={divergence => update(v.id, { divergence })} />
        </>}
        <Choice name="cw.timeframe" value={String(v.timeframe > timeframeSec ? v.timeframe : 0)} options={['0', ...[60, 300, 900, 1800, 3600, 14400, 86400].filter(s => s > timeframeSec && s % timeframeSec === 0).map(String)]} onChange={timeframe => update(v.id, { timeframe: Number(timeframe) })} />
        {v.timeframe > timeframeSec && <Toggle name="cw.waitClose" checked={v.waitClose} onChange={waitClose => update(v.id, { waitClose })} />}
        <Numeric name="cw.minTimeframe" value={v.minTimeframe} max={86400} onChange={minTimeframe => update(v.id, { minTimeframe, maxTimeframe: Math.max(v.maxTimeframe, minTimeframe) })} /><Numeric name="cw.maxTimeframe" value={v.maxTimeframe} min={v.minTimeframe} max={86400} onChange={maxTimeframe => update(v.id, { maxTimeframe })} />
        <Toggle name="cw.labels" checked={v.labels} onChange={labels => update(v.id, { labels })} /><Toggle name="cw.values" checked={v.values} onChange={values => update(v.id, { values })} />
      </div>
    </section>)}</div>
  </Modal>;
}
