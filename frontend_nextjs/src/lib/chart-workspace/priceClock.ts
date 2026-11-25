import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, MismatchDirection, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { brokerNow } from '@/lib/serverTime';
import { barEnd } from '@/lib/analysis/calendarBars';
import type { ChartTimeframe } from '@/lib/analysis/candles';

/**
 * Time left to the bar close as text: `52:47` under one hour, `02:50:53` under one day, `3g 02:50` from one day on
 * (`dayUnit` is the day letter of the language: g, d, T). The seconds are cut off, not rounded.
 */
export function formatCountdown(remainingSec: number, dayUnit: string): string {
  const s = Math.max(0, Math.floor(remainingSec));
  const p = (n: number) => String(n).padStart(2, '0');
  const days = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (days >= 1) return `${days}${dayUnit} ${p(h)}:${p(m)}`;
  if (h >= 1) return `${p(h)}:${p(m)}:${p(sec)}`;
  return `${p(m)}:${p(sec)}`;
}

/** Seconds from `brokerSec` (MT5 seconds) to the close of the bar that opened at `barOpen`; calendar-aware for W1 and MN. Not positive = the bar is closed. */
export function secondsToClose(timeframe: ChartTimeframe, barOpen: number, brokerSec: number): number {
  return barEnd(timeframe, barOpen) - brokerSec;
}

/** After the close of the last bar the clock counts the next bar this long before it decides that no new bar comes (weekend, market closed) */
export const NEXT_BAR_GRACE_SEC = 60;

/**
 * Seconds to show under the price label, or `null` to hide the box. Before the close of the last bar: the time to that close. After the close the next bar
 * runs already, but the chart shows it only with its first price (a tick, then the stream and a render): the clock counts the close of the next bar at once,
 * as TradingView does, and hides when that bar has not come `NEXT_BAR_GRACE_SEC` after the close (1125-D1).
 */
export function countdownLeft(timeframe: ChartTimeframe, barOpen: number, brokerSec: number): number | null {
  const close = barEnd(timeframe, barOpen);
  if (brokerSec < close) return close - brokerSec;
  if (brokerSec - close >= NEXT_BAR_GRACE_SEC) return null;
  return barEnd(timeframe, close) - brokerSec;
}

/** Height of one price axis label of lightweight-charts: font size plus the padding above and below (2.5 px per 12 px of font). */
export function axisLabelHeight(fontSize: number): number {
  return fontSize + 2 * (2.5 / 12) * fontSize;
}

/** Width of a label without its text: border (1) + inner and outer padding (5 px per 12 px of font each) + tick length (5). */
export function axisLabelPadding(fontSize: number): number {
  return 1 + 2 * (5 / 12) * fontSize + 5;
}

/** Text colour of a label: the library picks black on a light and white on a dark background (`generateContrastColors`). */
export function contrastText(rgb: readonly [number, number, number]): 'black' | 'white' {
  return 0.199 * rgb[0] + 0.687 * rgb[1] + 0.114 * rgb[2] > 160 ? 'black' : 'white';
}

let probe: CanvasRenderingContext2D | null = null;
/** The library asks for the text colour on every draw: parse a colour once, not once per draw */
const rgbCache = new Map<string, [number, number, number]>();
/** Any CSS colour as RGB (the canvas parses it) */
function toRgb(color: string): [number, number, number] {
  const known = rgbCache.get(color);
  if (known) return known;
  const rgb = parseRgb(color);
  if (rgbCache.size > 32) rgbCache.clear();
  rgbCache.set(color, rgb);
  return rgb;
}
function parseRgb(color: string): [number, number, number] {
  probe ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

type DrawTarget = Parameters<NonNullable<ReturnType<IPrimitivePaneView['renderer']>>['draw']>[0];

/** `MismatchDirection.NearestLeft` of lightweight-charts; the enum value is not imported so a node test can load this file */
const NEAREST_LEFT = -1 as MismatchDirection;

/**
 * The bar of the library's last value label: the last bar at or left of the right edge of the view. The library rounds the right
 * edge up (`strictRange` = ceil), so a bar that the edge cuts counts.
 */
export function labelBar(chart: Pick<IChartApi, 'timeScale'>, series: Pick<ISeriesApi<'Candlestick'>, 'dataByIndex'>): { close: number } | null {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range) return null;
  const bar = series.dataByIndex(Math.ceil(range.to), NEAREST_LEFT);
  return bar && 'close' in bar ? { close: bar.close as number } : null;
}

export interface PriceClockState {
  /** Broker offset (broker clock − UTC) in seconds; `null` hides the clock */
  offsetSec: number | null;
  /** Colour of the last value label (the box of the clock has the same one) */
  backColor: string;
  fontSize: number;
  /** Open time of the last bar (MT5 seconds); `null` hides the clock */
  lastBarTime: number | null;
  timeframe: ChartTimeframe;
  /** Day letter of the language (g, d, T) */
  dayUnit: string;
}

/**
 * Second label under the last price label: the time left to the close of the last bar (as TradingView shows it). It is a price axis view of the candle
 * series with a fixed coordinate, so the two boxes move together and the label alignment of the library does not shift it.
 * Both boxes follow the bar that the library uses for its label: the last bar at or left of the right edge of the view.
 * A fill under the two labels gives them one width (the wider text sets it), so they look like one box.
 */
export class PriceClock implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private timer: number | null = null;
  private align: number | null = null;
  /** The text of the last draw: a tick that finds the same second on screen needs no redraw (streaming and dragging draw anyway) */
  private drawn = '';
  private state: PriceClockState = { offsetSec: null, backColor: '#000', fontSize: 12, lastBarTime: null, timeframe: 'H1', dayUnit: 'd' };
  private readonly view: ISeriesPrimitiveAxisView;
  private readonly fill: IPrimitivePaneView;
  constructor(private readonly chart: IChartApi, private readonly series: ISeriesApi<'Candlestick'>, private readonly host: HTMLElement, private readonly now: () => number = Date.now) {
    this.view = {
      coordinate: () => -1e6,
      fixedCoordinate: () => this.publishY(),
      text: () => this.drawText(),
      textColor: () => contrastText(toRgb(this.state.backColor)),
      backColor: () => this.state.backColor,
      visible: () => this.open(),
      tickVisible: () => false,
    };
    this.fill = {
      zOrder: () => 'bottom',
      renderer: () => ({ draw: (target) => this.drawFill(target) }),
    };
  }
  attached(p: SeriesAttachedParameter<Time>) { this.param = p; this.sync(); }
  detached() { this.stop(); this.param = null; this.host.removeAttribute('data-price-clock'); this.host.removeAttribute('data-price-clock-y'); this.host.removeAttribute('data-price-label-y'); }
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] { return [this.view]; }
  priceAxisPaneViews(): readonly IPrimitivePaneView[] { return [this.fill]; }
  paneViews(): readonly IPrimitivePaneView[] { return []; }
  update(state: PriceClockState) { this.state = state; this.sync(); }
  private drawText() { return (this.drawn = this.text()); }
  /** Time left to the close of the running bar; `null` when unknown or when no new bar came for a while (weekend, market closed) */
  private remaining(): number | null {
    const { offsetSec, lastBarTime, timeframe } = this.state;
    if (offsetSec === null || lastBarTime === null) return null;
    return countdownLeft(timeframe, lastBarTime, brokerNow(offsetSec, this.now()));
  }
  private text() {
    const left = this.remaining();
    return left === null ? '' : formatCountdown(left, this.state.dayUnit);
  }
  /** y of the price label: the close of the bar that the library uses for it */
  private labelY(): number | null {
    const bar = labelBar(this.chart, this.series);
    return bar ? this.series.priceToCoordinate(bar.close) : null;
  }
  private labelPrice(): string | null {
    const bar = labelBar(this.chart, this.series);
    return bar ? this.series.priceFormatter().format(bar.close) : null;
  }
  private publishY(): number | undefined {
    const y = this.labelY();
    if (y === null) return undefined;
    const clockY = y + axisLabelHeight(this.state.fontSize);
    this.host.setAttribute('data-price-label-y', y.toFixed(1));
    this.host.setAttribute('data-price-clock-y', clockY.toFixed(1));
    return clockY;
  }
  /** The clock is switched on and a price label exists (the timer runs); `visible` also needs an open bar */
  private shown() { return this.state.offsetSec !== null && this.state.lastBarTime !== null && this.labelY() !== null; }
  private open() { return this.shown() && this.remaining() !== null; }
  private drawFill(target: DrawTarget) {
    const y = this.labelY(), price = this.labelPrice();
    if (!this.open() || y === null || price === null) return;
    const h = axisLabelHeight(this.state.fontSize);
    // The library puts the labels at the inner edge of the axis: the left edge on a right axis, the right edge on a left axis
    const leftAxis = this.series.options().priceScaleId === 'left';
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const { fontFamily } = this.chart.options().layout;
      context.font = `${this.state.fontSize}px ${fontFamily}`;
      const width = axisLabelPadding(this.state.fontSize) + Math.ceil(Math.max(context.measureText(price).width, context.measureText(this.text()).width));
      context.fillStyle = this.state.backColor;
      context.fillRect(leftAxis ? mediaSize.width - width : 0, y - h / 2, width, 2 * h);
    });
  }
  private sync() {
    if (this.shown()) {
      if (this.timer === null && this.align === null) {
        // Tick on the second boundary (+250 ms: the chart draws the second that the tick found), then every 1000 ms
        this.align = window.setTimeout(() => {
          this.align = null;
          this.timer = window.setInterval(() => this.tick(), 1000);
          this.tick();
        }, 1250 - (this.now() % 1000));
      }
      this.mirror();
      this.publishY();
      this.param?.requestUpdate(); // colour, font or visibility may have changed
    } else {
      this.stop();
      this.host.removeAttribute('data-price-clock');
      this.host.removeAttribute('data-price-clock-y');
      this.host.removeAttribute('data-price-label-y');
      this.param?.requestUpdate();
    }
  }
  /** One tick per second: ask for a redraw only when the last draw did not show this second (a full redraw of a big chart is costly) */
  tick() {
    const text = this.text();
    this.mirror(text);
    if (text !== this.drawn) this.param?.requestUpdate();
  }
  /** Text to the chart host for tests; no attribute while the box is hidden */
  private mirror(text = this.text()) {
    if (text) this.host.setAttribute('data-price-clock', text); else this.host.removeAttribute('data-price-clock');
  }
  private stop() {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    if (this.align !== null) { clearTimeout(this.align); this.align = null; }
  }
}
