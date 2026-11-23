import type { IChartApi, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, ISeriesPrimitiveAxisView, MismatchDirection, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { brokerNow } from '@/lib/serverTime';

/** `SS:DD:ss` of a broker time in MT5 seconds. MT5 seconds are the wall clock of the broker, so the UTC getters read it. */
export function formatBrokerClock(brokerSec: number): string {
  const d = new Date(Math.floor(brokerSec) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
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
/** Any CSS colour as RGB (the canvas parses it) */
function toRgb(color: string): [number, number, number] {
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
}

/**
 * Second label under the last price label (as TradingView shows the countdown there). It is a price axis view of the candle
 * series with a fixed coordinate, so the two boxes move together and the label alignment of the library does not shift it.
 * Both boxes follow the bar that the library uses for its label: the last bar at or left of the right edge of the view.
 * A fill under the two labels gives them one width (the wider text sets it), so they look like one box.
 */
export class PriceClock implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private timer: number | null = null;
  private state: PriceClockState = { offsetSec: null, backColor: '#000', fontSize: 12 };
  private readonly view: ISeriesPrimitiveAxisView;
  private readonly fill: IPrimitivePaneView;
  constructor(private readonly chart: IChartApi, private readonly series: ISeriesApi<'Candlestick'>, private readonly host: HTMLElement, private readonly now: () => number = Date.now) {
    this.view = {
      coordinate: () => -1e6,
      fixedCoordinate: () => this.publishY(),
      text: () => this.text(),
      textColor: () => contrastText(toRgb(this.state.backColor)),
      backColor: () => this.state.backColor,
      visible: () => this.shown(),
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
  private text() { return this.state.offsetSec === null ? '' : formatBrokerClock(brokerNow(this.state.offsetSec, this.now())); }
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
  private shown() { return this.state.offsetSec !== null && this.labelY() !== null; }
  private drawFill(target: DrawTarget) {
    const y = this.labelY(), price = this.labelPrice();
    if (!this.shown() || y === null || price === null) return;
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
      if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 1000);
      this.tick();
    } else {
      this.stop();
      this.host.removeAttribute('data-price-clock');
      this.host.removeAttribute('data-price-clock-y');
      this.host.removeAttribute('data-price-label-y');
      this.param?.requestUpdate();
    }
  }
  private tick() {
    this.host.setAttribute('data-price-clock', this.text());
    this.publishY();
    this.param?.requestUpdate();
  }
  private stop() { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }
}
