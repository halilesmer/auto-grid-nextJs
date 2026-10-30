import {
  BaselineSeries, ColorType, CrosshairMode, createTextWatermark, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  type IChartApi, type ISeriesApi, type ISeriesPrimitive, type IPrimitivePaneView, type ITextWatermarkPluginApi, type SeriesAttachedParameter, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar, MissingRange } from '@/lib/analysis/candles';
import { readChartColors, withAlpha } from '@/lib/chartTheme';
import { aggregateIndicatorBars, calculateIndicator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import type { Appearance } from '@/lib/chart-workspace/settings';

export interface ChartBinding { chart: IChartApi; candles: ISeriesApi<'Candlestick'>; host: HTMLDivElement; defaultMargins?: () => { top: number; bottom: number }; isDisposed: () => boolean; onDispose: (callback: () => void) => () => void; dispose: () => void }
export function createChartBinding(chart: IChartApi, candles: ISeriesApi<'Candlestick'>, host: HTMLDivElement, defaultMargins?: ChartBinding['defaultMargins']): ChartBinding {
  const callbacks = new Set<() => void>();
  let disposed = false;
  return { chart, candles, host, defaultMargins, isDisposed: () => disposed,
    onDispose(callback) { if (disposed) { callback(); return () => {}; } callbacks.add(callback); return () => { callbacks.delete(callback); }; },
    dispose() { if (disposed) return; disposed = true; for (const callback of callbacks) callback(); callbacks.clear(); },
  };
}
export function lineStyle(v: string) { if (v === 'dashed') return LineStyle.Dashed; if (v === 'dotted') return LineStyle.Dotted; return LineStyle.Solid; }
function scaleMode(v: string) { if (v === 'log') return PriceScaleMode.Logarithmic; if (v === 'percent') return PriceScaleMode.Percentage; return PriceScaleMode.Normal; }
export function appearanceColors(a: Appearance) {
  const c = readChartColors(), css = getComputedStyle(document.documentElement);
  const classic = a.preset === 'classic';
  const bg = a.background || (classic ? css.getPropertyValue('--chart-classic-bg').trim() : css.getPropertyValue('--card').trim());
  const white = css.getPropertyValue('--chart-classic-fg').trim();
  return { ...c, background: bg, up: a.up || (classic ? bg : c.up), down: a.down || (classic ? white : c.down), borderUp: a.borderUp || (classic ? white : c.up), borderDown: a.borderDown || (classic ? white : c.down), wickUp: a.wickUp || (classic ? white : c.up), wickDown: a.wickDown || (classic ? white : c.down), text: a.textColor || (classic ? white : c.text) };
}
export function applyAppearance(binding: ChartBinding, a: Appearance, digits: number | null) {
  if (binding.isDisposed()) return;
  const { chart, candles } = binding, c = appearanceColors(a);
  chart.applyOptions({
    layout: { background: { type: ColorType.Solid, color: c.background }, textColor: c.text, fontSize: a.fontSize, panes: { separatorColor: a.separator || c.border, enableResize: true } },
    grid: { vertLines: { visible: a.gridV, color: a.gridColor || c.grid }, horzLines: { visible: a.gridH, color: a.gridColor || c.grid } },
    crosshair: { mode: a.crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden, vertLine: { color: a.crosshairColor || c.crosshair, style: lineStyle(a.crosshairStyle), labelBackgroundColor: c.crosshairLabel }, horzLine: { color: a.crosshairColor || c.crosshair, style: lineStyle(a.crosshairStyle), labelBackgroundColor: c.crosshairLabel } },
    leftPriceScale: { visible: a.side === 'left', borderColor: a.axisColor || c.border }, rightPriceScale: { visible: a.side !== 'left', borderColor: a.axisColor || c.border }, timeScale: { borderColor: a.axisColor || c.border },
  });
  candles.applyOptions({
    priceScaleId: a.side, upColor: a.body ? c.up : 'transparent', downColor: a.body ? c.down : 'transparent', borderVisible: a.border, borderUpColor: c.borderUp, borderDownColor: c.borderDown,
    wickVisible: a.wick, wickUpColor: c.wickUp, wickDownColor: c.wickDown,
    priceLineVisible: a.priceLine, lastValueVisible: a.priceLabel, priceLineColor: a.priceColor || c.text, priceLineStyle: lineStyle(a.priceStyle),
    priceFormat: { type: 'price', precision: a.precision === 'auto' ? digits ?? 5 : Number(a.precision), minMove: 10 ** -(a.precision === 'auto' ? digits ?? 5 : Number(a.precision)) },
  });
  candles.priceScale().applyOptions({ autoScale: a.autoScale, invertScale: a.invert, alignLabels: a.align, mode: scaleMode(a.scale), scaleMargins: !a.marginsSet && binding.defaultMargins ? binding.defaultMargins() : { top: a.marginTop / 100, bottom: a.marginBottom / 100 } });
}

/** RSI band tint follows public series coordinates, so resizing and inverted axes remain correct. */
class BandTint implements ISeriesPrimitive<Time> {
  private series: SeriesAttachedParameter<Time>['series'] | null = null;
  constructor(private lower: number, private upper: number, private color: string) {}
  attached(p: SeriesAttachedParameter<Time>) { this.series = p.series; }
  detached() { this.series = null; }
  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => 'bottom', renderer: () => ({ draw: target => {
      const a = this.series?.priceToCoordinate(this.upper), b = this.series?.priceToCoordinate(this.lower);
      if (a == null || b == null) return;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => { context.fillStyle = this.color; context.fillRect(0, Math.min(a, b), mediaSize.width, Math.abs(a - b)); });
    } }) }];
  }
}

class DivergenceLines implements ISeriesPrimitive<Time> {
  private attachedTo: SeriesAttachedParameter<Time> | null = null;
  segments: { from: number; to: number; fromValue: number; toValue: number; bullish: boolean }[] = [];
  constructor(private positive: string, private negative: string) {}
  attached(p: SeriesAttachedParameter<Time>) { this.attachedTo = p; }
  detached() { this.attachedTo = null; }
  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => 'top', renderer: () => ({ draw: target => {
      const p = this.attachedTo; if (!p) return;
      target.useMediaCoordinateSpace(({ context }) => {
        context.lineWidth = 2;
        for (const segment of this.segments) {
          const x1 = p.chart.timeScale().timeToCoordinate(segment.from as UTCTimestamp), x2 = p.chart.timeScale().timeToCoordinate(segment.to as UTCTimestamp);
          const y1 = p.series.priceToCoordinate(segment.fromValue), y2 = p.series.priceToCoordinate(segment.toValue);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          context.strokeStyle = segment.bullish ? this.positive : this.negative;
          context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
        }
      });
    } }) }];
  }
}

export class IndicatorRenderer {
  private series: ISeriesApi<'Line' | 'Histogram' | 'Baseline'>[] = [];
  private signature = '';
  private groups: { config: Indicator; plots: ISeriesApi<'Line' | 'Histogram' | 'Baseline'>[]; result: ReturnType<typeof calculateIndicator> | null; divergence: DivergenceLines | null }[] = [];
  private watermark: ITextWatermarkPluginApi<Time> | null = null;
  constructor(private binding: ChartBinding) {}
  update(configs: Indicator[], bars: readonly Bar[], missing: readonly MissingRange[], tf: number, a: Appearance, symbol: string, until: number) {
    const { chart } = this.binding, colors = appearanceColors(a);
    const signature = JSON.stringify([configs, a.indicatorLabels, a.preset, colors.primary, colors.text, tf, a.side]);
    if (signature !== this.signature) {
      this.clearSeries(); this.signature = signature;
      for (const config of configs.filter(c => c.visible && tf >= c.minTimeframe && tf <= c.maxTimeframe)) {
        const pane = ['SMA', 'EMA', 'BB'].includes(config.kind) ? 0 : chart.panes().length;
        const color = config.color || colors.info, negative = config.negative || colors.down;
        const plots: typeof this.series = [];
        const line = (tone: string, histogram = false) => {
          const options = { priceScaleId: a.side, color: tone, lineWidth: config.width, lastValueVisible: a.indicatorLabels && config.labels, priceLineVisible: false, title: config.kind, priceFormat: { type: 'price' as const, precision: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 2 : 5, minMove: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 0.01 : 0.00001 } };
          const s = histogram ? chart.addSeries(HistogramSeries, options, pane) : chart.addSeries(LineSeries, options, pane);
          plots.push(s); this.series.push(s); return s;
        };
        const first = line(color, config.kind === 'EWO');
        const divergence = config.kind === 'RSI' && config.divergence ? new DivergenceLines(colors.up, negative) : null;
        if (divergence) first.attachPrimitive(divergence);
        if (pane > 0) chart.panes()[pane]?.setStretchFactor((chart.panes()[0]?.getStretchFactor() ?? 1) * 0.25);
        if (config.kind === 'RSI') {
          first.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
          if (config.bands) for (const p of [config.upper, config.middle, config.lower]) first.createPriceLine({ price: p, color: colors.muted, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
          if (config.background) first.attachPrimitive(new BandTint(config.lower, config.upper, withAlpha(color, .08)));
          if (config.smoothing !== 'none') { line(config.maColor || colors.warning); if (config.smoothing === 'BB') { line(colors.up); line(colors.up); } }
          if (config.gradients) for (const [threshold, top] of [[config.upper, true], [config.lower, false]] as const) {
            const s = chart.addSeries(BaselineSeries, { baseValue: { type: 'price', price: threshold }, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: top ? withAlpha(colors.up, .4) : 'transparent', topFillColor2: 'transparent', bottomFillColor1: 'transparent', bottomFillColor2: !top ? withAlpha(negative, .4) : 'transparent', priceLineVisible: false, lastValueVisible: false }, pane);
            plots.push(s); this.series.push(s);
          }
        }
        if (config.kind === 'MACD') { line(config.maColor || colors.warning); line(negative, true); }
        if (config.kind === 'BB') { line(color); line(color); }
        if (config.kind === 'EWO' || config.kind === 'MACD') first.createPriceLine({ price: 0, color: colors.muted, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
        this.groups.push({ config, plots, result: null, divergence });
      }
    }
    const values: { config: Indicator; value: Value }[] = [];
    for (const group of this.groups) {
      const { config, plots } = group;
      const visibleBars = bars.filter(b => b.time <= until);
      const source = config.timeframe > tf ? aggregateIndicatorBars(visibleBars, config.timeframe, tf, config.waitClose, until, missing) : visibleBars;
      const result = calculateIndicator(source, config, missing); group.result = result;
      const points = (data: Value[], histogram = false) => {
        const out: { time: UTCTimestamp; value?: number; color?: string; topFillColor1?: string; topFillColor2?: string; bottomFillColor1?: string; bottomFillColor2?: string }[] = [];
        let previous = -1;
        source.forEach((b, i) => {
          if (data[i] === null) {
            if (!histogram && previous >= 0) Object.assign(out[previous], { color: 'transparent', topFillColor1: 'transparent', topFillColor2: 'transparent', bottomFillColor1: 'transparent', bottomFillColor2: 'transparent' });
            out.push({ time: b.time as UTCTimestamp }); previous = -1;
          } else {
            const point = { time: b.time as UTCTimestamp, value: data[i] as number, color: undefined as string | undefined };
            if (histogram) point.color = (data[i] as number) >= 0 ? config.color || colors.up : config.negative || colors.down;
            previous = out.length; out.push(point);
          }
        });
        return out;
      };
      plots[0].setData(points(result.main, config.kind === 'EWO'));
      if (group.divergence) group.divergence.segments = result.divergences.map(d => ({ from: source[d.from].time, to: source[d.to].time, fromValue: result.main[d.from] as number, toValue: result.main[d.to] as number, bullish: d.bullish }));
      result.extra.forEach((v, i) => plots[i + 1]?.setData(points(v, config.kind === 'MACD' && i === 1)));
      if (config.kind === 'RSI' && config.gradients) for (const s of plots.slice(-2)) s.setData(points(result.main));
      values.push({ config, value: result.main.at(-1) ?? null });
    }
    if (!this.watermark) this.watermark = createTextWatermark(chart.panes()[0], { visible: false });
    this.watermark.applyOptions({ visible: a.watermark, lines: [{ text: symbol, color: withAlpha(a.watermarkColor || colors.muted, .15), fontSize: 60 }] });
    return values;
  }
  private clearSeries() { for (const s of [...this.series].reverse()) this.binding.chart.removeSeries(s); this.series = []; this.groups = []; }
  destroy() { this.clearSeries(); this.watermark?.detach(); this.watermark = null; }
}
