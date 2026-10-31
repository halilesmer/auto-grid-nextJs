import {
  BaselineSeries, ColorType, CrosshairMode, createTextWatermark, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  type IChartApi, type ISeriesApi, type LogicalRange, type ISeriesPrimitive, type IPrimitivePaneView, type ITextWatermarkPluginApi, type SeriesAttachedParameter, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar, MissingRange } from '@/lib/analysis/candles';
import { readChartColors, withAlpha } from '@/lib/chartTheme';
import { emptyChartDocument, useChartWorkspaceStore, type VisibleTime } from '@/store/useChartWorkspaceStore';
import { aggregateIndicatorBars, calculateIndicator, isOscillator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
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
/** Wartezeit, bis ein Zoom gespeichert wird; so oft ändert sich der Bereich beim Ziehen */
const VIEW_SAVE_DELAY_MS = 180;
/** Der Chart übernimmt eine gesetzte Ansicht erst im nächsten Bild und rundet sie dabei auf Kerzen; diese Meldungen sind kein Zoom */
const VIEW_SETTLE_MS = 150;

/** Zeigt den gespeicherten Zeitbereich, wenn er die geladenen Kerzen überlappt, sonst alle Kerzen (wie „Ansicht zurücksetzen“). */
export function restoreChartView(chart: IChartApi, times: readonly number[], saved: VisibleTime | undefined) {
  const first = times[0], last = times[times.length - 1];
  const overlaps = saved && first !== undefined && saved.to >= first && saved.from <= last;
  if (overlaps) chart.timeScale().setVisibleRange({ from: saved.from as UTCTimestamp, to: saved.to as UTCTimestamp });
  else chart.timeScale().fitContent();
}

/**
 * Speichert den Zoom des Nutzers in dem Chart-Dokument `contextKey`; ein Bereich, der alle Kerzen zeigt, löscht ihn.
 * Änderungen durch neue Kerzen (`pointCount`) oder eine andere Breite sind kein Zoom und bleiben unbeachtet.
 * Setzt `data-visible-range` (von,bis in Kerzenzeit) am Element; gibt die Abmeldung zurück, die Ausstehendes schreibt.
 */
export function rememberChartView(chart: IChartApi, host: HTMLElement, contextKey: string, pointCount: () => number): () => void {
  const scale = chart.timeScale();
  let count = pointCount(), width = scale.width();
  const asText = (r: { from: unknown; to: unknown }) => `${r.from},${r.to}`;
  const settledAt = performance.now() + VIEW_SETTLE_MS;
  let pending: { zoom: VisibleTime | undefined } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const { zoom } = pending;
    pending = null;
    const store = useChartWorkspaceStore.getState();
    const doc = store.documents[contextKey] ?? emptyChartDocument();
    if (doc.visibleTime?.from === zoom?.from && doc.visibleTime?.to === zoom?.to) return;
    const { visibleTime, ...rest } = doc;
    void visibleTime;
    store.setDocument(contextKey, zoom ? { ...rest, visibleTime: zoom } : rest);
  };
  const onChange = (logical: LogicalRange | null) => {
    const range = scale.getVisibleRange();
    if (!logical || !range) return;
    host.setAttribute('data-visible-range', asText(range));
    if (pointCount() !== count || scale.width() !== width || performance.now() < settledAt) {
      count = pointCount();
      width = scale.width();
      return;
    }
    // fitContent() liegt bis auf einen halben Kerzenabstand an den Rändern
    const showsAll = logical.from <= 1 && logical.to >= count - 2;
    pending = { zoom: showsAll ? undefined : { from: Number(range.from), to: Number(range.to) } };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, VIEW_SAVE_DELAY_MS);
  };
  scale.subscribeVisibleLogicalRangeChange(onChange);
  return () => {
    scale.unsubscribeVisibleLogicalRangeChange(onChange);
    flush();
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
const COLLAPSED_PANE_PX = 32;
/** Ratio against 1 for the other panes; the chart keeps its own minimum pane height. */
const MAXIMIZED_PANE_STRETCH = 1000;

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
  private paneIndices = new Map<string, number>();
  private maximizedPaneId: string | null = null;
  private stretchBeforeMaximize: number[] | null = null;
  private watermark: ITextWatermarkPluginApi<Time> | null = null;
  constructor(private binding: ChartBinding) {}
  update(configs: Indicator[], bars: readonly Bar[], missing: readonly MissingRange[], tf: number, a: Appearance, symbol: string, until: number, maximizedPaneId: string | null = null) {
    const { chart } = this.binding, colors = appearanceColors(a);
    const active = configs.filter(config => config.visible && tf >= config.minTimeframe && tf <= config.maxTimeframe);
    const scaleOf = (config: Indicator) => !isOscillator(config) || config.scaleSide === 'auto' ? a.side : config.scaleSide;
    chart.applyOptions({ leftPriceScale: { visible: active.some(config => scaleOf(config) === 'left') || a.side === 'left' }, rightPriceScale: { visible: active.some(config => scaleOf(config) === 'right') || a.side !== 'left' } });
    const signature = JSON.stringify([configs, a.indicatorLabels, a.preset, colors.primary, colors.text, tf, a.side]);
    const rebuilt = signature !== this.signature;
    if (rebuilt) {
      this.restoreStretch(); this.clearSeries(); this.paneIndices.clear(); this.signature = signature;
      const paneById = new Map<string, number>();
      for (const config of active) {
        let pane = 0;
        if (isOscillator(config)) {
          if (!paneById.has(config.paneId)) paneById.set(config.paneId, chart.panes().length);
          pane = paneById.get(config.paneId)!;
          this.paneIndices.set(config.paneId, pane);
        }
        const color = config.color || colors.info, negative = config.negative || colors.down;
        const plots: typeof this.series = [];
        const line = (tone: string, histogram = false) => {
          const options = { priceScaleId: scaleOf(config), color: tone, lineWidth: config.width, lastValueVisible: a.indicatorLabels && config.labels, priceLineVisible: false, title: config.kind, priceFormat: { type: 'price' as const, precision: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 2 : 5, minMove: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 0.01 : 0.00001 } };
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
    if (rebuilt || maximizedPaneId !== this.maximizedPaneId) this.layoutPanes(active, maximizedPaneId);
    if (!this.watermark) this.watermark = createTextWatermark(chart.panes()[0], { visible: false });
    this.watermark.applyOptions({ visible: a.watermark, lines: [{ text: symbol, color: withAlpha(a.watermarkColor || colors.muted, .15), fontSize: 60 }] });
    return values;
  }
  private layoutPanes(active: readonly Indicator[], maximizedPaneId: string | null) {
    const panes = this.binding.chart.panes();
    this.restoreStretch();
    // pane.setHeight() reads the last layout, which new panes do not have yet. Stretch factors need no layout.
    const collapsed = new Set(active.filter(config => isOscillator(config) && config.paneCollapsed).map(config => this.paneIndices.get(config.paneId)));
    const openStretch = panes.reduce((sum, pane, index) => collapsed.has(index) ? sum : sum + pane.getStretchFactor(), 0);
    const roomForOpenPanes = Math.max(1, this.binding.host.clientHeight - collapsed.size * COLLAPSED_PANE_PX);
    for (const index of collapsed) if (index !== undefined) panes[index]?.setStretchFactor(COLLAPSED_PANE_PX * openStretch / roomForOpenPanes);
    const maximized = maximizedPaneId === null ? undefined : this.paneIndices.get(maximizedPaneId);
    if (maximized !== undefined) {
      this.stretchBeforeMaximize = panes.map(pane => pane.getStretchFactor());
      panes.forEach((pane, index) => pane.setStretchFactor(index === maximized ? MAXIMIZED_PANE_STRETCH : 1));
    }
    this.maximizedPaneId = maximizedPaneId;
  }
  private restoreStretch() {
    this.stretchBeforeMaximize?.forEach((stretch, index) => this.binding.chart.panes()[index]?.setStretchFactor(stretch));
    this.stretchBeforeMaximize = null;
  }
  private clearSeries() { for (const s of [...this.series].reverse()) this.binding.chart.removeSeries(s); this.series = []; this.groups = []; }
  destroy() { this.restoreStretch(); this.clearSeries(); this.watermark?.detach(); this.watermark = null; }
}
