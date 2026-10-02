/**
 * Zeichnungen im Chart, die keine Serie sind (lightweight-charts Series Primitives):
 * - ZoneBandPrimitive: Preisband der Zone (min–max), abschaltbar
 * - MissingDataPrimitive: fehlende Datenbereiche grau schraffiert, nie abschaltbar (Datenqualität)
 * - PauseLinesPrimitive: Marktpausen als dünne gestrichelte Trennlinien, abschaltbar
 */
import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  Logical,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
type Draw = (target: Parameters<IPrimitivePaneRenderer['draw']>[0]) => void;

/** Gemeinsame Hülle: hält Chart/Serie, zeichnet über eine Funktion, fordert Neuzeichnen an. */
abstract class BasePrimitive implements ISeriesPrimitive<Time> {
  protected chart: IChartApiBase<Time> | null = null;
  protected series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly views: readonly IPrimitivePaneView[];

  constructor(zOrder: PrimitivePaneViewZOrder) {
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
    this.views = [{ zOrder: () => zOrder, renderer: () => renderer }];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  paneViews() {
    return this.views;
  }

  protected update() {
    this.requestUpdate?.();
  }

  /**
   * x eines Zeitpunkts, auch außerhalb der Ansicht (timeToCoordinate liefert dort null: ein halb
   * sichtbarer Bereich würde sonst gar nicht gezeichnet). Der logische Index ist der Punkt auf der Zeitachse.
   */
  protected x(time: number): number | null {
    const scale = this.chart?.timeScale();
    const index = scale?.timeToIndex(time as UTCTimestamp, false);
    if (!scale || index === null || index === undefined) return null;
    return scale.logicalToCoordinate(index as unknown as Logical);
  }

  protected halfBar(): number {
    return (this.chart?.timeScale().options().barSpacing ?? 6) / 2;
  }

  protected abstract draw: Draw;
}

export class ZoneBandPrimitive extends BasePrimitive {
  private band: { min: number; max: number; fill: string } | null = null;

  constructor() {
    super('bottom');
  }

  set(band: { min: number; max: number; fill: string } | null) {
    this.band = band;
    this.update();
  }

  protected draw: Draw = (target) => {
    const band = this.band;
    if (!band || !this.series) return;
    const top = this.series.priceToCoordinate(band.max);
    const bottom = this.series.priceToCoordinate(band.min);
    if (top === null || bottom === null) return;
    target.useBitmapCoordinateSpace(({ context, bitmapSize, verticalPixelRatio }) => {
      context.fillStyle = band.fill;
      const y1 = Math.round(Math.min(top, bottom) * verticalPixelRatio);
      const y2 = Math.round(Math.max(top, bottom) * verticalPixelRatio);
      context.fillRect(0, y1, bitmapSize.width, Math.max(1, y2 - y1));
    });
  };
}

export interface MissingArea {
  firstSlot: number;
  lastSlot: number;
}

export class MissingDataPrimitive extends BasePrimitive {
  private areas: MissingArea[] = [];
  private style = { fill: 'rgba(128,128,128,0.12)', stripe: 'rgba(128,128,128,0.25)', text: '#888', label: '' };

  constructor() {
    super('bottom');
  }

  set(areas: MissingArea[], style: { fill: string; stripe: string; text: string; label: string }) {
    this.areas = areas;
    this.style = style;
    this.update();
  }

  protected draw: Draw = (target) => {
    if (this.areas.length === 0) return;
    const half = this.halfBar();
    const spans = this.areas
      .map((a) => [this.x(a.firstSlot), this.x(a.lastSlot)] as const)
      .filter((s): s is readonly [number, number] => s[0] !== null && s[1] !== null);
    const { fill, stripe, text, label } = this.style;
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      for (const [a, b] of spans) {
        const x1 = Math.round((a - half) * hr);
        const x2 = Math.round((b + half) * hr);
        const w = Math.max(1, x2 - x1);
        context.fillStyle = fill;
        context.fillRect(x1, 0, w, bitmapSize.height);
        // Schraffur: deutlich anders als eine Pause oder ein leerer Chart
        context.save();
        context.beginPath();
        context.rect(x1, 0, w, bitmapSize.height);
        context.clip();
        context.strokeStyle = stripe;
        context.lineWidth = Math.max(1, hr);
        const step = 10 * hr;
        for (let x = x1 - bitmapSize.height; x < x2; x += step) {
          context.moveTo(x, bitmapSize.height);
          context.lineTo(x + bitmapSize.height, 0);
        }
        context.stroke();
        if (label && w > 70 * hr) {
          context.fillStyle = text;
          context.font = `${Math.round(11 * vr)}px ui-sans-serif, system-ui, sans-serif`;
          context.textAlign = 'center';
          context.fillText(label, x1 + w / 2, Math.round(18 * vr));
        }
        context.restore();
      }
    });
  };
}

export class PauseLinesPrimitive extends BasePrimitive {
  private pauses: { before: number; after: number }[] = [];
  private color = 'rgba(128,128,128,0.5)';

  constructor() {
    super('bottom');
  }

  set(pauses: { before: number; after: number }[], color: string) {
    this.pauses = pauses;
    this.color = color;
    this.update();
  }

  protected draw: Draw = (target) => {
    if (this.pauses.length === 0) return;
    const xs = this.pauses
      .map((p) => {
        const a = this.x(p.before);
        const b = this.x(p.after);
        return a === null || b === null ? null : (a + b) / 2;
      })
      .filter((x): x is number => x !== null);
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: hr }) => {
      context.save();
      context.strokeStyle = this.color;
      context.lineWidth = Math.max(1, Math.round(hr));
      context.setLineDash([4 * hr, 4 * hr]);
      context.beginPath();
      for (const x of xs) {
        const px = Math.round(x * hr) + 0.5;
        context.moveTo(px, 0);
        context.lineTo(px, bitmapSize.height);
      }
      context.stroke();
      context.restore();
    });
  };
}

/** Verbindung Einstieg → Ausstieg eines Trades (gepunktet), Farbe nach Ergebnis. */
export interface TradeLink {
  key: string;
  from: { time: number; price: number };
  to: { time: number; price: number };
  color: string;
}

export class TradeLinksPrimitive extends BasePrimitive {
  private links: TradeLink[] = [];

  constructor() {
    super('normal');
  }

  set(links: TradeLink[]) {
    this.links = links;
    this.update();
  }

  /** Wie x(), aber zur nächsten Zeit auf der Achse (ein Trade-Zeitpunkt liegt nicht immer auf einem Punkt) */
  private nearestX(time: number): number | null {
    const scale = this.chart?.timeScale();
    const index = scale?.timeToIndex(time as UTCTimestamp, true);
    if (!scale || index === null || index === undefined) return null;
    return scale.logicalToCoordinate(index as unknown as Logical);
  }

  protected draw: Draw = (target) => {
    if (this.links.length === 0 || !this.series) return;
    const series = this.series;
    const segs = this.links.flatMap((l) => {
      const x1 = this.nearestX(l.from.time);
      const x2 = this.nearestX(l.to.time);
      const y1 = series.priceToCoordinate(l.from.price);
      const y2 = series.priceToCoordinate(l.to.price);
      return x1 === null || x2 === null || y1 === null || y2 === null ? [] : [{ x1, x2, y1: Number(y1), y2: Number(y2), color: l.color }];
    });
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      context.save();
      context.lineWidth = Math.max(1, Math.round(hr));
      context.setLineDash([2 * hr, 3 * hr]);
      for (const s of segs) {
        context.strokeStyle = s.color;
        context.beginPath();
        context.moveTo(Math.round(s.x1 * hr), Math.round(s.y1 * vr));
        context.lineTo(Math.round(s.x2 * hr), Math.round(s.y2 * vr));
        context.stroke();
      }
      context.restore();
    });
  };
}

/** Fraktal: kleines Dreieck über dem Hoch (oben) bzw. unter dem Tief (unten); gehandelte kräftiger. */
export interface FractalMark {
  time: number;
  price: number;
  side: 'U' | 'D';
  color: string;
  traded: boolean;
}

export class FractalsPrimitive extends BasePrimitive {
  private marks: FractalMark[] = [];

  constructor() {
    super('top');
  }

  set(marks: FractalMark[]) {
    this.marks = marks;
    this.update();
  }

  protected draw: Draw = (target) => {
    if (this.marks.length === 0 || !this.series) return;
    const series = this.series;
    const pts = this.marks.flatMap((m) => {
      const x = this.x(m.time);
      const y = series.priceToCoordinate(m.price);
      return x === null || y === null ? [] : [{ x, y: Number(y), m }];
    });
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      for (const { x, y, m } of pts) {
        const size = (m.traded ? 5 : 3.5) * hr;
        const gap = 4 * vr;
        const cx = x * hr;
        // Spitze zeigt auf den Preis: oben über dem Hoch nach oben, unten unter dem Tief nach unten
        const tip = m.side === 'U' ? y * vr - gap - size * 1.4 : y * vr + gap + size * 1.4;
        const base = m.side === 'U' ? y * vr - gap : y * vr + gap;
        context.beginPath();
        context.moveTo(cx, tip);
        context.lineTo(cx - size, base);
        context.lineTo(cx + size, base);
        context.closePath();
        context.fillStyle = m.color;
        context.fill();
      }
    });
  };
}
