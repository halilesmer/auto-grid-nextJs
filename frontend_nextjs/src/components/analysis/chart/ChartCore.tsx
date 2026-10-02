'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useFormat, useT } from '@/i18n';
import { isBar, liveBar, wilderRsi, type Bar, type ChartData } from '@/lib/analysis/candles';
import { readChartColors, withAlpha, type ChartColors } from '@/lib/chartTheme';
import { useThemeStore } from '@/store';
import {
  FractalsPrimitive,
  MissingDataPrimitive,
  PauseLinesPrimitive,
  TradeLinksPrimitive,
  ZoneBandPrimitive,
  type FractalMark,
} from './primitives';

export type LineTone = 'primary' | 'up' | 'down' | 'muted';

/** Waagrechte Linie über die ganze Breite (Zonengrenze, Stufe, Position, Order, TP/SL). */
export interface OverlayLine {
  key: string;
  price: number;
  title: string;
  tone: LineTone;
  style: 'solid' | 'dashed' | 'dotted';
  width?: 1 | 2;
  axisLabel?: boolean;
}

/** Trade-Pfeil bzw. Ausstiegspunkt (Zeit = Öffnungszeit der Kerze, Preis = Ausführungspreis). */
export interface TradeMarker {
  key: string;
  time: number;
  price: number;
  kind: 'entryBuy' | 'entrySell' | 'exit';
  tone: LineTone;
  text?: string;
}

/** Verbindung Einstieg → Ausstieg (Zeiten = Öffnungszeit der Kerze). */
export interface TradeLinkLine {
  key: string;
  from: { time: number; price: number };
  to: { time: number; price: number };
  tone: LineTone;
}

export interface FractalPoint {
  time: number;
  price: number;
  side: 'U' | 'D';
  /** Der Bot hat auf dieses Fraktal eine Order gesetzt, die ausgeführt wurde */
  traded: boolean;
}

interface ChartCoreProps {
  data: ChartData;
  timeframeSec: number;
  digits: number | null;
  /** Neue Auswahl (Konto/Symbol/Zeitrahmen/Zeitraum): Ansicht neu ausrichten */
  viewKey: string;
  band: { min: number; max: number } | null;
  lines: OverlayLine[];
  showPauses: boolean;
  showRsi: boolean;
  /** Live-Preis des Streams für die laufende Kerze; null = keine Live-Kerze (anderes Symbol, Uhr unsicher) */
  live: { price: number; nowSec: number } | null;
  /** Trades aus dem Archiv: Pfeile, Ausstiege, Verbindungen (leer = aus) */
  markers?: TradeMarker[];
  links?: TradeLinkLine[];
  fractals?: FractalPoint[];
  /** Zusatzzeilen unter dem Fadenkreuz je Kerzenzeit (z. B. Trades dieser Kerze) */
  notes?: Map<number, string[]>;
  /** Ansicht auf diese Kerzenzeit setzen; `seq` erzwingt es auch bei gleicher Zeit erneut */
  focus?: { time: number; seq: number } | null;
}

const EMPTY_MARKERS: TradeMarker[] = [];
const EMPTY_LINKS: TradeLinkLine[] = [];
const EMPTY_FRACTALS: FractalPoint[] = [];
/** Ab so vielen Trade-Markern werden Pfeile kleiner und Verbindungen blasser (sonst verdecken sie die Kerzen) */
const DENSE_MARKERS = 200;
/** Höchstens so viele Trade-Zeilen unter dem Fadenkreuz */
const MAX_HOVER_NOTES = 4;
/** Beim Springen zu einem Trade: so viele Kerzen links und rechts davon */
const FOCUS_BARS = 60;

const RSI_PERIOD = 14;
/** Bis zu so vielen Punkten passt die Ansicht den ganzen Zeitraum ein, sonst die letzten VISIBLE_BARS */
const FIT_MAX_POINTS = 2000;
const VISIBLE_BARS = 300;

const LINE_STYLE = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted } as const;

function toneColor(c: ChartColors, tone: LineTone) {
  return tone === 'up' ? c.up : tone === 'down' ? c.down : tone === 'muted' ? c.muted : c.primary;
}

/**
 * Kerzenchart der Analyse-Seite (lightweight-charts v5). Zeiten gehen unverändert als MT5-Zeit an den
 * Chart (er rechnet sie wie UTC, docs/analyse-regeln.md §1). Fehlende Bereiche sind Leerstellen mit
 * grauer Schraffur, nie erfundene Kerzen.
 */
export function ChartCore({
  data,
  timeframeSec,
  digits,
  viewKey,
  band,
  lines,
  showPauses,
  showRsi,
  live,
  markers = EMPTY_MARKERS,
  links = EMPTY_LINKS,
  fractals = EMPTY_FRACTALS,
  notes,
  focus,
}: ChartCoreProps) {
  const t = useT();
  const fmt = useFormat();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiRef = useRef<ISeriesApi<'Line'> | null>(null);
  const primitives = useRef<{
    band: ZoneBandPrimitive;
    missing: MissingDataPrimitive;
    pauses: PauseLinesPrimitive;
    links: TradeLinksPrimitive;
    fractals: FractalsPrimitive;
  } | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const lastBar = useRef<Bar | null>(null);
  const fittedKey = useRef<string | null>(null);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [colors, setColors] = useState<ChartColors | null>(null);
  const [hover, setHover] = useState<{ bar: Bar | null; time: number } | null>(null);

  const barByTime = useMemo(() => new Map(data.bars.map((b) => [b.time, b])), [data.bars]);
  const barByTimeRef = useRef(barByTime);
  useEffect(() => {
    barByTimeRef.current = barByTime;
  }, [barByTime]);

  // Chart einmal anlegen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
        fontSize: 11,
        panes: { separatorColor: 'transparent' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.08 } },
    });
    const candles = chart.addSeries(CandlestickSeries, { borderVisible: false, priceLineVisible: true });
    const band = new ZoneBandPrimitive();
    const missing = new MissingDataPrimitive();
    const pauses = new PauseLinesPrimitive();
    const links = new TradeLinksPrimitive();
    const fractalMarks = new FractalsPrimitive();
    candles.attachPrimitive(band);
    candles.attachPrimitive(missing);
    candles.attachPrimitive(pauses);
    candles.attachPrimitive(links);
    candles.attachPrimitive(fractalMarks);
    markersApi.current = createSeriesMarkers(candles, []);
    chartRef.current = chart;
    candlesRef.current = candles;
    primitives.current = { band, missing, pauses, links, fractals: fractalMarks };

    const onMove = (param: MouseEventParams<Time>) => {
      if (param.time === undefined) {
        setHover(null);
        return;
      }
      const time = Number(param.time);
      setHover({ bar: barByTimeRef.current.get(time) ?? null, time });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candlesRef.current = null;
      rsiRef.current = null;
      primitives.current = null;
      markersApi.current = null;
      priceLines.current = [];
      // Ein neu angelegter Chart (z. B. StrictMode im Dev-Modus) muss wieder ausgerichtet werden
      fittedKey.current = null;
      lastBar.current = null;
    };
  }, []);

  // Theme-Farben: nach dem Klassenwechsel am <html> lesen
  useEffect(() => {
    const frame = requestAnimationFrame(() => setColors(readChartColors()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!colors) return;
    chartRef.current?.applyOptions({
      layout: { textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      crosshair: {
        vertLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
        horzLine: { color: colors.crosshair, labelBackgroundColor: colors.crosshairLabel },
      },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border },
    });
    candlesRef.current?.applyOptions({
      upColor: colors.up,
      downColor: colors.down,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
    });
    rsiRef.current?.applyOptions({ color: colors.info });
  }, [colors]);

  useEffect(() => {
    if (digits === null || !Number.isFinite(digits)) return;
    candlesRef.current?.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 10 ** -digits } });
  }, [digits]);

  // Kerzen + Leerstellen
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || !candles) return;
    candles.setData(data.points.map((p) => ({ ...p, time: p.time as UTCTimestamp })));
    lastBar.current = data.bars.length > 0 ? data.bars[data.bars.length - 1] : null;
    if (lastBar.current) containerRef.current?.setAttribute('data-last-bar', `${lastBar.current.time}:${lastBar.current.close}`);
    // Nur bei neuer Auswahl ausrichten; das Nachladen des Endstücks lässt die Ansicht stehen
    if (fittedKey.current === viewKey || data.points.length === 0) return;
    fittedKey.current = viewKey;
    const n = data.points.length;
    const from = n <= FIT_MAX_POINTS ? -1 : n - VISIBLE_BARS;
    // autoSize setzt die Breite erst nach dem ersten ResizeObserver-Lauf; vorher bliebe die Ansicht
    // beim Standard-Kerzenabstand stehen
    let frame = 0;
    let tries = 0;
    const align = () => {
      if (chart.timeScale().width() === 0 && tries++ < 60) {
        frame = requestAnimationFrame(align);
        return;
      }
      chart.timeScale().setVisibleLogicalRange({ from, to: n + 3 });
    };
    align();
    return () => cancelAnimationFrame(frame);
  }, [data, viewKey]);

  // Fehlende Bereiche (immer) und Marktpausen (abschaltbar)
  useEffect(() => {
    if (!colors || !primitives.current) return;
    primitives.current.missing.set(data.missing, {
      fill: withAlpha(colors.muted, 0.1),
      stripe: withAlpha(colors.muted, 0.28),
      text: colors.muted,
      label: t('analysis.chart.noData'),
    });
    primitives.current.pauses.set(showPauses ? data.pauses : [], withAlpha(colors.muted, 0.55));
  }, [data, colors, showPauses, t]);

  useEffect(() => {
    if (!colors || !primitives.current) return;
    primitives.current.band.set(band ? { ...band, fill: withAlpha(colors.primary, 0.06) } : null);
  }, [band, colors]);

  // Linien (Zone, Stufen, Positionen, Orders): bei Änderung neu zeichnen
  useEffect(() => {
    const candles = candlesRef.current;
    if (!candles || !colors) return;
    priceLines.current = lines
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .map((l) =>
        candles.createPriceLine({
          price: l.price,
          title: l.title,
          color: l.style === 'solid' ? toneColor(colors, l.tone) : withAlpha(toneColor(colors, l.tone), 0.75),
          lineWidth: l.width ?? 1,
          lineStyle: LINE_STYLE[l.style],
          axisLabelVisible: l.axisLabel ?? false,
        }),
      );
    return () => {
      try {
        priceLines.current.forEach((line) => candles.removePriceLine(line));
      } catch {
        /* Chart schon entfernt */
      }
      priceLines.current = [];
    };
  }, [lines, colors]);

  // Trades aus dem Archiv: Pfeile am Ausführungspreis, Ausstiege als Punkt, Verbindung gepunktet
  useEffect(() => {
    const api = markersApi.current;
    if (!api || !colors) return;
    const dense = markers.length > DENSE_MARKERS;
    const list: SeriesMarker<Time>[] = [...markers]
      .sort((a, b) => a.time - b.time)
      .map((m) => {
        const color = toneColor(colors, m.tone);
        const base = { id: m.key, time: m.time as UTCTimestamp, price: m.price, color, text: m.text, size: dense ? 0.5 : 1 };
        // Kaufpfeil zeigt von unten auf den Preis, Verkaufspfeil von oben
        if (m.kind === 'entryBuy') return { ...base, shape: 'arrowUp', position: 'atPriceTop' } as const;
        if (m.kind === 'entrySell') return { ...base, shape: 'arrowDown', position: 'atPriceBottom' } as const;
        return { ...base, shape: 'circle', position: 'atPriceMiddle', size: dense ? 0.35 : 0.6 } as const;
      });
    api.setMarkers(list);
    containerRef.current?.setAttribute('data-markers', String(list.length));
  }, [markers, colors, data]);

  useEffect(() => {
    if (!colors || !primitives.current) return;
    primitives.current.links.set(
      links.map((l) => ({
        key: l.key,
        from: l.from,
        to: l.to,
        color: withAlpha(toneColor(colors, l.tone), links.length > DENSE_MARKERS / 2 ? 0.3 : 0.8),
      })),
    );
  }, [links, colors, data]);

  useEffect(() => {
    if (!colors || !primitives.current) return;
    const marks: FractalMark[] = fractals.map((f) => ({
      ...f,
      color: f.traded ? colors.primary : withAlpha(colors.muted, 0.7),
    }));
    primitives.current.fractals.set(marks);
    containerRef.current?.setAttribute('data-fractals', String(marks.length));
  }, [fractals, colors, data]);

  // Zu einem Trade springen (Klick in der Trade-Liste); nur bei neuem Klick, nicht nach jedem Nachladen
  const pointsRef = useRef(data.points);
  useEffect(() => {
    pointsRef.current = data.points;
  }, [data.points]);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !focus) return;
    const pts = pointsRef.current;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].time < focus.time) lo = mid + 1;
      else hi = mid;
    }
    chart.timeScale().setVisibleLogicalRange({ from: lo - FOCUS_BARS, to: lo + FOCUS_BARS });
  }, [focus]);

  // RSI im eigenen Bereich, aus den angezeigten Kerzen
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!showRsi) {
      if (rsiRef.current) chart.removeSeries(rsiRef.current);
      rsiRef.current = null;
      return;
    }
    if (!rsiRef.current) {
      rsiRef.current = chart.addSeries(LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, 1);
      rsiRef.current.createPriceLine({ price: 70, color: 'rgba(128,128,128,0.45)', lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '' });
      rsiRef.current.createPriceLine({ price: 30, color: 'rgba(128,128,128,0.45)', lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '' });
      chart.panes()[1]?.setStretchFactor(0.25);
      chart.panes()[0]?.setStretchFactor(0.75);
    }
    if (colors) rsiRef.current.applyOptions({ color: colors.info });
    // Über die echten Kerzen gerechnet: eine Lücke bricht die Kette nicht künstlich auf
    const rsi = wilderRsi(data.bars.map((b) => b.close), RSI_PERIOD);
    const byTime = new Map(data.bars.map((b, i) => [b.time, rsi[i]]));
    // Über einen fehlenden Bereich zieht lightweight-charts die Linie durch. Die Farbe eines Punktes gilt
    // für das Stück ab ihm: der letzte Wert vor der Lücke wird unsichtbar, die Lücke bleibt leer
    const points: ({ time: UTCTimestamp; value?: number; color?: string })[] = [];
    let lastValued = -1;
    for (const p of data.points) {
      const v = isBar(p) ? byTime.get(p.time) : null;
      if (v === null || v === undefined) {
        if (!isBar(p) && lastValued >= 0) points[lastValued].color = 'transparent';
        points.push({ time: p.time as UTCTimestamp });
      } else {
        lastValued = points.length;
        points.push({ time: p.time as UTCTimestamp, value: v });
      }
    }
    rsiRef.current.setData(points);
  }, [showRsi, data, colors]);

  // Laufende Kerze aus dem Live-Preis (nur die aktuelle oder die direkt folgende Zeitspanne)
  useEffect(() => {
    if (!live || !candlesRef.current) return;
    const bar = liveBar(lastBar.current, live.price, live.nowSec, timeframeSec);
    // Nie vor dem letzten Punkt (z. B. eine Leerstelle nach der letzten Kerze): update() würde werfen
    const lastPoint = data.points[data.points.length - 1];
    if (!bar || (lastPoint && bar.time < lastPoint.time)) return;
    candlesRef.current.update({ ...bar, time: bar.time as UTCTimestamp });
    lastBar.current = bar;
    // Stand der letzten Kerze am Element (Tests und Fehlersuche; der Chart zeichnet in <canvas>)
    containerRef.current?.setAttribute('data-last-bar', `${bar.time}:${bar.close}`);
  }, [live, timeframeSec, data.points]);

  // Nur unter dem Fadenkreuz: ohne Maus würde die Legende die geladene statt der laufenden Kerze zeigen
  const shown = hover?.bar ?? null;
  const allNotes = hover ? (notes?.get(hover.time) ?? []) : [];
  // Viele Trades in einer Kerze: nur die ersten, der Rest gezählt (sonst deckt die Legende den Chart zu)
  const hoverNotes =
    allNotes.length > MAX_HOVER_NOTES
      ? [...allNotes.slice(0, MAX_HOVER_NOTES), t('analysis.chart.notes.more', { n: allNotes.length - MAX_HOVER_NOTES })]
      : allNotes;
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 font-mono text-[11px] tabular-nums text-muted-foreground"
        data-testid="chart-legend"
      >
        {hover && !hover.bar ? (
          <span className="text-warning">{t('analysis.chart.noData')}</span>
        ) : shown ? (
          (['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k}>
              {t(`analysis.chart.ohlc.${k}`)} <span className="text-foreground">{fmt.price(shown[k], digits ?? undefined)}</span>
            </span>
          ))
        ) : null}
        {hoverNotes.map((n, i) => (
          <span key={i} className="basis-full text-foreground" data-testid="chart-legend-note">
            {n}
          </span>
        ))}
      </div>
      {/* Die TradingView-Namensnennung (Link) erzeugt lightweight-charts selbst */}
      <div
        ref={containerRef}
        data-tooltip-exempt
        data-testid="analysis-chart"
        data-bars={data.bars.length}
        data-gap-areas={data.missing.length}
        data-pauses={data.pauses.length}
        className="h-[360px] w-full sm:h-[480px]"
      />
    </div>
  );
}
