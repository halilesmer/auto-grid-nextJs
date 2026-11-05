import {
  BaselineSeries, ColorType, CrosshairMode, createTextWatermark, HistogramSeries, LineSeries, LineStyle, PriceScaleMode,
  type IChartApi, type IPaneApi, type ISeriesApi, type LineWidth, type LogicalRange, type ISeriesPrimitive, type IPrimitivePaneView, type ITextWatermarkPluginApi, type SeriesAttachedParameter, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import type { Bar, MissingRange } from '@/lib/analysis/candles';
import { readChartColors, withAlpha } from '@/lib/chartTheme';
import { emptyChartDocument, useChartWorkspaceStore, type VisibleTime } from '@/store/useChartWorkspaceStore';
import { aggregateIndicatorBars, calculateIndicator, isOscillator, type Indicator, type Value } from '@/lib/chart-workspace/indicators';
import { orderPanes, presentPanes, type SystemPaneId } from '@/lib/chart-workspace/paneOrder';
import { valueAtTime } from '@/lib/chart-workspace/hover';
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
/** Kleinster Kerzenabstand in px, den lightweight-charts zulässt (Standard von `minBarSpacing`) */
const MIN_BAR_SPACING_PX = 0.5;

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
 * Setzt `data-visible-range` (von,bis in Kerzenzeit) an den Elementen `hosts`; gibt die Abmeldung zurück, die Ausstehendes schreibt.
 */
export function rememberChartView(chart: IChartApi, hosts: HTMLElement[], contextKey: string, pointCount: () => number): () => void {
  const scale = chart.timeScale();
  let count = pointCount(), width = scale.width();
  const asText = (r: { from: unknown; to: unknown }) => `${r.from},${r.to}`;
  const settledAt = performance.now() + VIEW_SETTLE_MS;
  // Steht die Ansicht beim Anmelden schon, meldet der Chart danach keine Änderung mehr
  const shown = scale.getVisibleRange();
  const publish = (range: { from: unknown; to: unknown }) => hosts.forEach((host) => host.setAttribute('data-visible-range', asText(range)));
  if (shown) publish(shown);
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
    publish(range);
    if (pointCount() !== count || scale.width() !== width || performance.now() < settledAt) {
      count = pointCount();
      width = scale.width();
      return;
    }
    // fitContent() liegt bis auf einen halben Kerzenabstand an den Rändern. Passen mehr Kerzen in die Breite, als der
    // kleinste Kerzenabstand zulässt, ist die breiteste Ansicht bis zur letzten Kerze die Standardansicht.
    const reachesEnd = logical.to >= count - 2;
    const widest = logical.to - logical.from + 2 >= scale.width() / MIN_BAR_SPACING_PX;
    const showsAll = reachesEnd && (logical.from <= 1 || widest);
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
/** Height of every oscillator pane as a part of the price pane: 2 : 1 like TradingView (system panes too). */
const OSCILLATOR_PANE_PART = 0.5;
/** On a small screen the oscillator panes give way, so the price pane keeps this height (UI-12). */
const MIN_PRICE_PANE_PX = 150;
/** Height of the time axis below the last pane */
const TIME_AXIS_PX = 28;
/** Ratio against 1 for the other panes; the chart keeps its own minimum pane height. */
const MAXIMIZED_PANE_STRETCH = 1_000_000;

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

/** Number of gaps between the marks on a selected line, so it has 5 marks across the pane. */
const SELECTION_MARK_GAPS = 6;
const SELECTION_MARK_RADIUS_PX = 4;

/** Marks on a selected indicator line, like TradingView's selection. Positions follow the visible time range, so they stay on the line while the chart pans. */
class SelectionMarks implements ISeriesPrimitive<Time> {
  private attachedTo: SeriesAttachedParameter<Time> | null = null;
  constructor(private valueAt: (time: number) => Value, private color: string, private fill: string) {}
  attached(p: SeriesAttachedParameter<Time>) { this.attachedTo = p; }
  detached() { this.attachedTo = null; }
  paneViews(): readonly IPrimitivePaneView[] {
    return [{ zOrder: () => 'top', renderer: () => ({ draw: target => {
      const p = this.attachedTo; if (!p) return;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.lineWidth = 2; context.strokeStyle = this.color; context.fillStyle = this.fill;
        for (let i = 1; i < SELECTION_MARK_GAPS; i++) {
          const time = p.chart.timeScale().coordinateToTime(mediaSize.width * i / SELECTION_MARK_GAPS);
          if (time === null) continue;
          const x = p.chart.timeScale().timeToCoordinate(time), value = this.valueAt(Number(time)), y = value === null ? null : p.series.priceToCoordinate(value);
          if (x === null || y === null) continue;
          context.beginPath(); context.arc(x, y, SELECTION_MARK_RADIUS_PX, 0, Math.PI * 2); context.fill(); context.stroke();
        }
      });
    } }) }];
  }
}

type Plot = ISeriesApi<'Line' | 'Histogram' | 'Baseline'>;

/** System oscillator (RSI(7), Wave 5/35): ready-made points, drawn in its own pane like a user oscillator. The calculation stays with the caller, so drawings and rules see the same numbers. */
export interface SystemPaneInput {
  id: SystemPaneId;
  label: string;
  kind: 'line' | 'histogram';
  points: readonly { time: number; value: number }[];
  /** Dashed lines, for example overbought and oversold */
  levels?: readonly number[];
  /** Decimal places of the price scale */
  precision: number;
}
export interface SystemPaneModel extends SystemPaneInput { hidden: boolean; collapsed: boolean }
/** The series of a system pane while it is drawn, for the drawing layer above the chart (formation page); null when the pane is off or hidden. */
export interface SystemSeriesRef { current: ISeriesApi<'Line' | 'Histogram'> | null }
export type SystemSeriesRefs = Record<SystemPaneId, SystemSeriesRef>;
/** Sent on the chart host after the renderer built or changed panes, so layers above the chart measure again. */
export const PANES_CHANGED_EVENT = 'chart-panes-changed';
interface IndicatorGroup { config: Indicator; plots: Plot[]; result: ReturnType<typeof calculateIndicator> | null; times: number[]; divergence: DivergenceLines | null; color: string; marks: SelectionMarks | null }

export class IndicatorRenderer {
  private series: Plot[] = [];
  private signature = '';
  private groups: IndicatorGroup[] = [];
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private markFill = '';
  /** First series of each pane (user pane id or system pane id). The pane number is read from it when needed, never stored. */
  private paneSeries = new Map<string, Plot>();
  private systemDrawn: { system: SystemPaneModel; plot: Plot }[] = [];
  private maximizedPaneId: string | null = null;
  /** Stretch factor of each pane before a pane was maximized; keyed by the pane, not by its number. */
  private stretchBeforeMaximize: { pane: IPaneApi<Time>; stretch: number }[] | null = null;
  private watermark: ITextWatermarkPluginApi<Time> | null = null;
  constructor(private binding: ChartBinding, private systemSeries?: SystemSeriesRefs) {}
  /**
   * `systems` are the system oscillators of switched-on layers; `order` is the pane order from top to bottom (pane ids of
   * user oscillators and system ids). Hidden and switched-off panes get no series, so the chart removes their panes.
   */
  update(configs: Indicator[], bars: readonly Bar[], missing: readonly MissingRange[], tf: number, a: Appearance, symbol: string, until: number, maximizedPaneId: string | null = null, systems: readonly SystemPaneModel[] = [], order: readonly string[] = []) {
    const { chart } = this.binding, colors = appearanceColors(a), theme = readChartColors();
    // Hidden (eye) oscillators stay in `active`: their pane keeps its place and height, only the series is invisible
    const active = configs.filter(config => (config.visible || isOscillator(config)) && tf >= config.minTimeframe && tf <= config.maxTimeframe);
    const scaleOf = (config: Indicator) => !isOscillator(config) || config.scaleSide === 'auto' ? a.side : config.scaleSide;
    chart.applyOptions({ leftPriceScale: { visible: active.some(config => config.visible && scaleOf(config) === 'left') || a.side === 'left' }, rightPriceScale: { visible: active.some(config => config.visible && scaleOf(config) === 'right') || a.side !== 'left' } });
    const paneOrder = orderPanes(order, presentPanes(active, systems.map(system => system.id)));
    const signature = JSON.stringify([configs, a.indicatorLabels, a.preset, colors.primary, colors.text, tf, a.side, paneOrder, systems.map(({ points, ...rest }) => { void points; return rest; }), theme.primary]);
    const rebuilt = signature !== this.signature;
    if (rebuilt) {
      this.restoreStretch(); this.clearSeries(); this.signature = signature;
      const basePanes = chart.panes().length;
      const build = (config: Indicator) => {
        let pane = 0;
        if (isOscillator(config)) pane = this.paneSeries.get(config.paneId)?.getPane().paneIndex() ?? chart.panes().length;
        const color = config.color || colors.info, negative = config.negative || colors.down;
        const plots: typeof this.series = [];
        const line = (tone: string, histogram = false) => {
          const options = { visible: config.visible, priceScaleId: scaleOf(config), color: tone, lineWidth: config.width, lastValueVisible: a.indicatorLabels && config.labels, priceLineVisible: false, title: config.kind, priceFormat: { type: 'price' as const, precision: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 2 : 5, minMove: config.kind === 'RSI' || (config.kind === 'EWO' && config.percent) ? 0.01 : 0.00001 } };
          const s = histogram ? chart.addSeries(HistogramSeries, options, pane) : chart.addSeries(LineSeries, options, pane);
          // Ein Indikator-Bereich übernähme sonst die großen oberen Ränder der Kerzen-Achse (Platz für die Bedienung auf dem Chart)
          if (pane > 0) s.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
          plots.push(s); this.series.push(s); return s;
        };
        const first = line(color, config.kind === 'EWO');
        if (isOscillator(config) && !this.paneSeries.has(config.paneId)) this.paneSeries.set(config.paneId, first);
        const divergence = config.kind === 'RSI' && config.divergence ? new DivergenceLines(colors.up, negative) : null;
        if (divergence) first.attachPrimitive(divergence);
        if (config.kind === 'RSI') {
          first.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
          if (config.bands) for (const p of [config.upper, config.middle, config.lower]) first.createPriceLine({ price: p, color: colors.muted, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
          if (config.background) first.attachPrimitive(new BandTint(config.lower, config.upper, withAlpha(color, .08)));
          if (config.smoothing !== 'none') { line(config.maColor || colors.warning); if (config.smoothing === 'BB') { line(colors.up); line(colors.up); } }
          if (config.gradients) for (const [threshold, top] of [[config.upper, true], [config.lower, false]] as const) {
            const s = chart.addSeries(BaselineSeries, { baseValue: { type: 'price', price: threshold }, visible: config.visible, topLineColor: 'transparent', bottomLineColor: 'transparent', topFillColor1: top ? withAlpha(colors.up, .4) : 'transparent', topFillColor2: 'transparent', bottomFillColor1: 'transparent', bottomFillColor2: !top ? withAlpha(negative, .4) : 'transparent', priceLineVisible: false, lastValueVisible: false }, pane);
            plots.push(s); this.series.push(s);
          }
        }
        if (config.kind === 'MACD') { line(config.maColor || colors.warning); line(negative, true); }
        if (config.kind === 'BB') { line(color); line(color); }
        if (config.kind === 'EWO' || config.kind === 'MACD') first.createPriceLine({ price: 0, color: colors.muted, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false });
        this.groups.push({ config, plots, result: null, times: [], divergence, color, marks: null });
      };
      // Overlays on the price pane first, then one pane after the other in the saved order; a pane is built only when it has something to draw
      for (const config of active) if (!isOscillator(config)) build(config);
      for (const paneId of paneOrder) {
        const system = systems.find(item => item.id === paneId);
        if (system) { this.buildSystem(system, theme); continue; }
        for (const config of active) if (isOscillator(config) && config.paneId === paneId) build(config);
      }
      this.binding.host.setAttribute('data-system-panes', String(basePanes + this.systemDrawn.length));
    }
    const values: { config: Indicator; value: Value }[] = [];
    for (const group of this.groups) {
      const { config, plots } = group;
      if (!config.visible) { group.result = null; group.times = []; continue; } // hidden by the eye: no calculation, no value
      const visibleBars = bars.filter(b => b.time <= until);
      const source = config.timeframe > tf ? aggregateIndicatorBars(visibleBars, config.timeframe, tf, config.waitClose, until, missing) : visibleBars;
      const result = calculateIndicator(source, config, missing); group.result = result; group.times = source.map(b => b.time);
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
    for (const { system, plot } of this.systemDrawn) {
      plot.setData(system.points.map(p => system.kind === 'histogram' ? { time: p.time as UTCTimestamp, value: p.value, color: p.value >= 0 ? theme.up : theme.down } : { time: p.time as UTCTimestamp, value: p.value }));
    }
    this.markFill = colors.background;
    this.applyEmphasis();
    if (rebuilt || maximizedPaneId !== this.maximizedPaneId) {
      this.layoutPanes(new Set([...active.filter(config => isOscillator(config) && config.paneCollapsed).map(config => config.paneId), ...this.systemDrawn.filter(item => item.system.collapsed).map(item => item.system.id)]), maximizedPaneId);
      // Layers above the chart (formation drawings) measure the panes again
      if (rebuilt) this.binding.host.dispatchEvent(new CustomEvent(PANES_CHANGED_EVENT));
    }
    if (!this.watermark) this.watermark = createTextWatermark(chart.panes()[0], { visible: false });
    this.watermark.applyOptions({ visible: a.watermark, lines: [{ text: symbol, color: withAlpha(a.watermarkColor || colors.muted, .15), fontSize: 60 }] });
    return values;
  }
  /** Value of every drawn indicator at `time` (the candle under the crosshair); without a time, its latest value. */
  valuesAt(time: number | null): Map<string, Value> {
    return new Map(this.groups.map(group => [group.config.id, valueAtTime(group.times, group.result?.main ?? [], time)]));
  }
  /** Indicator that owns a chart series, or null for the candles, drawings and other series. */
  ownerOf(series: unknown): string | null {
    return this.groups.find(group => (group.plots as unknown[]).includes(series))?.config.id ?? null;
  }
  /** Chart pane of a pane id (user pane group or system pane), read from its series now; null while nothing of it is drawn. */
  paneIndexOf(paneId: string): number | null {
    const plot = this.paneSeries.get(paneId);
    if (!plot || this.binding.isDisposed()) return null;
    try { return plot.getPane().paneIndex(); } catch { return null; }
  }
  /** Every open oscillator pane gets half the height of the price pane; a room too small for that keeps the price pane at its minimum. */
  private applyPaneParts(collapsed: ReadonlySet<number>) {
    const panes = this.binding.chart.panes(), base = panes[0]?.getStretchFactor() || 1;
    const open = panes.map((_, index) => index).filter(index => index > 0 && !collapsed.has(index));
    const room = this.binding.host.clientHeight - TIME_AXIS_PX - panes.length /* 1 px separator each */ - collapsed.size * COLLAPSED_PANE_PX;
    let part = OSCILLATOR_PANE_PART;
    if (room > MIN_PRICE_PANE_PX && open.length && room / (1 + part * open.length) < MIN_PRICE_PANE_PX) part = (room - MIN_PRICE_PANE_PX) / (open.length * MIN_PRICE_PANE_PX);
    for (const index of open) panes[index].setStretchFactor(base * part);
  }
  /** One pane with one series for a system oscillator; its series goes to `systemSeries` for the drawing layer. */
  private buildSystem(system: SystemPaneModel, theme: ReturnType<typeof readChartColors>) {
    const { chart } = this.binding, pane = chart.panes().length;
    const priceFormat = { type: 'price' as const, precision: system.precision, minMove: 10 ** -system.precision };
    const plot = system.kind === 'histogram'
      ? chart.addSeries(HistogramSeries, { visible: !system.hidden, priceLineVisible: false, lastValueVisible: false, base: 0, priceFormat }, pane)
      : chart.addSeries(LineSeries, { visible: !system.hidden, color: theme.primary, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, priceFormat }, pane);
    // The pane would take the large top margin of the candle axis (room for the controls)
    plot.priceScale().applyOptions({ scaleMargins: system.kind === 'histogram' ? { top: 0.1, bottom: 0.1 } : { top: 0.08, bottom: 0.08 } });
    for (const price of system.levels ?? []) plot.createPriceLine({ price, color: 'rgba(128,128,128,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false });
    this.series.push(plot); this.paneSeries.set(system.id, plot); this.systemDrawn.push({ system, plot });
    if (this.systemSeries && !system.hidden) this.systemSeries[system.id].current = plot as ISeriesApi<'Line' | 'Histogram'>;
  }
  /** Draws the hovered and the selected indicator thicker; the selected one also gets marks. */
  emphasize(hoveredId: string | null, selectedId: string | null) {
    this.hoveredId = hoveredId; this.selectedId = selectedId;
    this.applyEmphasis();
  }
  private applyEmphasis() {
    for (const group of this.groups) {
      const { config } = group, selected = config.id === this.selectedId, raised = selected || config.id === this.hoveredId;
      const width = (raised ? Math.min(4, config.width + 1) : config.width) as LineWidth;
      for (const plot of group.plots) if (plot.seriesType() === 'Line') (plot as ISeriesApi<'Line'>).applyOptions({ lineWidth: width }); // Histogram- und Baseline-Reihen haben keine Linienbreite
      if (selected && !group.marks) {
        group.marks = new SelectionMarks(time => valueAtTime(group.times, group.result?.main ?? [], time), group.color, this.markFill);
        group.plots[0].attachPrimitive(group.marks);
      } else if (!selected && group.marks) {
        group.plots[0].detachPrimitive(group.marks); group.marks = null;
      }
    }
  }
  private layoutPanes(collapsedIds: ReadonlySet<string>, maximizedPaneId: string | null) {
    const panes = this.binding.chart.panes();
    this.restoreStretch();
    // pane.setHeight() reads the last layout, which new panes do not have yet. Stretch factors need no layout.
    const collapsed = new Set([...collapsedIds].map(id => this.paneIndexOf(id)).filter((index): index is number => index !== null));
    this.applyPaneParts(collapsed);
    const openStretch = panes.reduce((sum, pane, index) => collapsed.has(index) ? sum : sum + pane.getStretchFactor(), 0);
    const roomForOpenPanes = Math.max(1, this.binding.host.clientHeight - collapsed.size * COLLAPSED_PANE_PX);
    for (const index of collapsed) panes[index]?.setStretchFactor(COLLAPSED_PANE_PX * openStretch / roomForOpenPanes);
    const maximized = maximizedPaneId === null ? null : this.paneIndexOf(maximizedPaneId);
    if (maximized !== null) {
      this.stretchBeforeMaximize = panes.map(pane => ({ pane, stretch: pane.getStretchFactor() }));
      panes.forEach((pane, index) => pane.setStretchFactor(index === maximized ? MAXIMIZED_PANE_STRETCH : 1));
      // The chart keeps a 2 px strip and a separator for each pane at any ratio. Like TradingView, the other panes go completely.
      const rows = new Set<HTMLElement>();
      panes.forEach((pane, index) => { const row = pane.getHTMLElement()?.closest('tr'); if (row && index !== maximized) rows.add(row); });
      for (const row of [...rows]) { const next = row.nextElementSibling; if (next instanceof HTMLElement && next.children.length === 1) rows.add(next); }
      const before = maximized > 0 ? panes[maximized].getHTMLElement()?.closest('tr')?.previousElementSibling : null;
      if (before instanceof HTMLElement && before.children.length === 1) rows.add(before);
      for (const row of rows) row.style.setProperty('display', 'none');
      this.hiddenRows = [...rows];
    }
    this.maximizedPaneId = maximizedPaneId;
  }
  /** Pane rows hidden while a pane is maximized */
  private hiddenRows: HTMLElement[] = [];
  private restoreStretch() {
    for (const row of this.hiddenRows) row.style.removeProperty('display');
    this.hiddenRows = [];
    // A pane the chart removed since then cannot take a factor any more; its saved value is of no use
    for (const { pane, stretch } of this.stretchBeforeMaximize ?? []) { try { pane.setStretchFactor(stretch); } catch { /* pane is gone */ } }
    this.stretchBeforeMaximize = null;
  }
  private clearSeries() {
    for (const s of [...this.series].reverse()) this.binding.chart.removeSeries(s);
    this.series = []; this.groups = []; this.paneSeries.clear(); this.systemDrawn = [];
    if (this.systemSeries) for (const ref of Object.values(this.systemSeries)) ref.current = null;
  }
  destroy() { this.restoreStretch(); this.clearSeries(); this.watermark?.detach(); this.watermark = null; }
}
