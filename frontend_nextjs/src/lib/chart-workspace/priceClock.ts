import type { IPrimitivePaneView, MismatchDirection, ISeriesPrimitive, ISeriesPrimitiveAxisView, ISeriesApi, SeriesAttachedParameter, Time } from 'lightweight-charts';
import { brokerNow } from '@/lib/serverTime';

/** `SS:DD:ss` of a broker time in MT5 seconds. MT5 seconds are the wall clock of the broker, so the UTC getters read it. */
export function formatBrokerClock(brokerSec: number): string {
  const d = new Date(Math.floor(brokerSec) * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Height of one price axis label of lightweight-charts for a font size: font plus the top and bottom padding of the library. */
export function axisLabelHeight(fontSize: number): number {
  return Math.ceil(fontSize + 2 * (2.5 / 12) * fontSize + 1);
}

/** `MismatchDirection.NearestLeft` of lightweight-charts; the enum value is not imported so a node test can load this file */
const NEAREST_LEFT = -1 as MismatchDirection;

export interface PriceClockState {
  /** Broker offset (broker clock − UTC) in seconds; `null` hides the clock */
  offsetSec: number | null;
  /** Colour of the last value label */
  backColor: string;
  textColor: string;
  fontSize: number;
}

/**
 * Second label under the last price label (as TradingView shows the countdown there). It is a price axis view of the candle
 * series with a fixed coordinate, so the two boxes move together and the label alignment of the library does not shift it.
 */
export class PriceClock implements ISeriesPrimitive<Time> {
  private param: SeriesAttachedParameter<Time> | null = null;
  private timer: number | null = null;
  private state: PriceClockState = { offsetSec: null, backColor: '#000', textColor: '#fff', fontSize: 12 };
  private readonly view: ISeriesPrimitiveAxisView;
  constructor(private readonly series: ISeriesApi<'Candlestick'>, private readonly host: HTMLElement, private readonly now: () => number = Date.now) {
    this.view = {
      coordinate: () => -1e6,
      fixedCoordinate: () => { const y = this.lastY(); return y === null ? undefined : y + axisLabelHeight(this.state.fontSize); },
      text: () => this.text(),
      textColor: () => this.state.textColor,
      backColor: () => this.state.backColor,
      visible: () => this.shown(),
      tickVisible: () => false,
    };
  }
  attached(p: SeriesAttachedParameter<Time>) { this.param = p; this.sync(); }
  detached() { this.stop(); this.param = null; this.host.removeAttribute('data-price-clock'); }
  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] { return [this.view]; }
  paneViews(): readonly IPrimitivePaneView[] { return []; }
  update(state: PriceClockState) { this.state = state; this.sync(); }
  private text() { return this.state.offsetSec === null ? '' : formatBrokerClock(brokerNow(this.state.offsetSec, this.now())); }
  private lastY(): number | null {
    const bar = this.series.dataByIndex(Number.MAX_SAFE_INTEGER, NEAREST_LEFT);
    if (!bar || !('close' in bar)) return null;
    return this.series.priceToCoordinate(bar.close);
  }
  private shown() { return this.state.offsetSec !== null && this.lastY() !== null; }
  private sync() {
    if (this.shown()) {
      if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 1000);
      this.tick();
    } else {
      this.stop();
      this.host.removeAttribute('data-price-clock');
      this.param?.requestUpdate();
    }
  }
  private tick() {
    this.host.setAttribute('data-price-clock', this.text());
    this.param?.requestUpdate();
  }
  private stop() { if (this.timer !== null) { clearInterval(this.timer); this.timer = null; } }
}
