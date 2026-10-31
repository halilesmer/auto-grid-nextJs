'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
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
import { isBar, liveBar, type Bar, type ChartData } from '@/lib/analysis/candles';
import { readChartColors, withAlpha, type ChartColors } from '@/lib/chartTheme';
import { useThemeStore } from '@/store';
import { ChartWorkspace, type WorkspaceContext } from '@/components/chart-workspace/ChartWorkspace';
import { type ChartBinding, createChartBinding, appearanceColors, rememberChartView, restoreChartView } from '@/components/chart-workspace/runtime';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
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
  workspace?: WorkspaceContext;
  workspaceOverlays?: React.ReactNode;
  clockNow?: number | null;
  data: ChartData;
  timeframeSec: number;
  digits: number | null;
  /** Neue Auswahl (Konto/Symbol/Zeitrahmen/Zeitraum): Ansicht neu ausrichten */
  viewKey: string;
  band: { min: number; max: number } | null;
  lines: OverlayLine[];
  showPauses: boolean;
  /** Schraffur der fehlenden Bereiche; die Leerstellen selbst bleiben (es wird keine Kerze erfunden) */
  showGaps: boolean;
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
  /** Backtest-only realized balance and equity areas in the lower pane. */
  balance?: { time: number; value: number }[];
  equity?: { time: number; value: number }[];
  /** Keep the right edge on the replay cursor while candles are revealed. */
  followTail?: boolean;
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

/** Bis zu so vielen Punkten passt der Backtest den ganzen Zeitraum ein, sonst die letzten VISIBLE_BARS */
const FIT_MAX_POINTS = 2000;
const VISIBLE_BARS = 300;

function previousColor(up: boolean, body: boolean, positive: string, negative: string) { if (!body) return 'transparent'; return up ? positive : negative; }
const LINE_STYLE = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted } as const;

function toneColor(c: ChartColors, tone: LineTone) {
  if (tone === 'up') return c.up;
  if (tone === 'down') return c.down;
  if (tone === 'muted') return c.muted;
  return c.primary;
}

/**
 * Kerzenchart der Analyse-Seite (lightweight-charts v5). Zeiten gehen unverändert als MT5-Zeit an den
 * Chart (er rechnet sie wie UTC, docs/analyse-regeln.md §1). Fehlende Bereiche sind Leerstellen mit
 * grauer Schraffur, nie erfundene Kerzen.
 */
export function ChartCore({
  workspace, workspaceOverlays, clockNow,
  data,
  timeframeSec,
  digits,
  viewKey,
  band,
  lines,
  showPauses,
  showGaps,
  showRsi,
  live,
  markers = EMPTY_MARKERS,
  links = EMPTY_LINKS,
  fractals = EMPTY_FRACTALS,
  notes,
  focus,
  balance,
  equity,
  followTail = false,
}: ChartCoreProps) {
  const t = useT();
  const fmt = useFormat();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [binding, setBinding] = useState<ChartBinding | null>(null);
  const [alignedView, setAlignedView] = useState<string | null>(null);
  const [workspaceTail, setWorkspaceTail] = useState<{ key: string; bar: Bar } | null>(null);
  const appearance = useChartWorkspaceStore(useShallow(s => s.preview ?? ((workspace?.view === 'analysis' || workspace?.view === 'free') ? s.documents[workspace.key]?.appearance ?? s.appearance : s.appearance)));
  const effectiveBars = useMemo(() => {
    if (!workspaceTail || workspaceTail.key !== viewKey || workspaceTail.bar.time < (data.bars.at(-1)?.time ?? Infinity)) return data.bars;
    const out = [...data.bars];
    if (out.at(-1)?.time === workspaceTail.bar.time) out[out.length - 1] = workspaceTail.bar; else out.push(workspaceTail.bar);
    return out;
  }, [data.bars, workspaceTail, viewKey]);
  const balanceRef = useRef<ISeriesApi<'Area'> | null>(null);
  const equityRef = useRef<ISeriesApi<'Area'> | null>(null);
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
  const workspaceKey = workspace?.key;
  const workspaceView = workspace?.view;
  const forgetView = useRef<(() => void) | null>(null);
  const pointsRef = useRef(data.points);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [colors, setColors] = useState<ChartColors | null>(null);
  const [hover, setHover] = useState<{ bar: Bar | null; time: number } | null>(null);

  const barByTime = useMemo(() => new Map(data.bars.map((b) => [b.time, b])), [data.bars]);
  const barByTimeRef = useRef(barByTime);
  useEffect(() => {
    barByTimeRef.current = barByTime;
  }, [barByTime]);

  const hasCurves = !!(balance || equity);
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
    const balanceSeries = hasCurves ? chart.addSeries(AreaSeries, {
      lineColor: '#8b5cf6', topColor: 'rgba(139,92,246,0.18)', bottomColor: 'rgba(139,92,246,0.01)',
      lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    }, 1) : null;
    const equitySeries = hasCurves ? chart.addSeries(AreaSeries, {
      lineColor: '#22c55e', topColor: 'rgba(34,197,94,0.22)', bottomColor: 'rgba(34,197,94,0.01)',
      lineWidth: 1, priceLineVisible: false, lastValueVisible: false,
    }, 1) : null;
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
    const attached = createChartBinding(chart, candles, el);
    const readyFrame = requestAnimationFrame(() => setBinding(attached));
    chartRef.current = chart;
    candlesRef.current = candles;
    balanceRef.current = balanceSeries;
    equityRef.current = equitySeries;
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
      forgetView.current?.();
      forgetView.current = null;
      cancelAnimationFrame(readyFrame);
      attached.dispose?.();
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      candlesRef.current = null;
      balanceRef.current = null;
      equityRef.current = null;
      primitives.current = null;
      markersApi.current = null;
      priceLines.current = [];
      // Ein neu angelegter Chart (z. B. StrictMode im Dev-Modus) muss wieder ausgerichtet werden
      fittedKey.current = null;
      lastBar.current = null;
    };
  }, [hasCurves]);

  // Theme-Farben: nach dem Klassenwechsel am <html> lesen
  useEffect(() => {
    const frame = requestAnimationFrame(() => setColors(readChartColors()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  useEffect(() => {
    if (!colors) return;
    balanceRef.current?.applyOptions({ lineColor: colors.info, topColor: withAlpha(colors.info, 0.18), bottomColor: withAlpha(colors.info, 0.01) });
    equityRef.current?.applyOptions({ lineColor: colors.up, topColor: withAlpha(colors.up, 0.2), bottomColor: withAlpha(colors.up, 0.01) });
  }, [colors]);

  useEffect(() => {
    balanceRef.current?.setData((balance ?? []).map((p) => ({ ...p, time: p.time as UTCTimestamp })));
    equityRef.current?.setData((equity ?? []).map((p) => ({ ...p, time: p.time as UTCTimestamp })));
    const lastBalance = balance?.at(-1);
    const lastEquity = equity?.at(-1);
    containerRef.current?.setAttribute('data-last-balance', lastBalance ? `${lastBalance.time}:${lastBalance.value}` : '');
    containerRef.current?.setAttribute('data-last-equity', lastEquity ? `${lastEquity.time}:${lastEquity.value}` : '');
  }, [balance, equity]);

  // Kerzen + Leerstellen
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    const el = containerRef.current;
    if (!chart || !candles || !el) return;
    // Vor setData, damit rememberChartView die neue Punktzahl kennt, wenn der Chart den Bereich meldet
    pointsRef.current = data.points;
    const c = appearanceColors(appearance);
    candles.setData(data.points.map((p, i) => {
      const prev = data.points[i - 1];
      const override = appearance.previous && isBar(p) && prev && isBar(prev) ? { color: previousColor(p.close >= prev.close, appearance.body, c.up, c.down), borderColor: p.close >= prev.close ? c.borderUp : c.borderDown, wickColor: p.close >= prev.close ? c.wickUp : c.wickDown } : {};
      return { ...p, ...override, time: p.time as UTCTimestamp };
    }));
    lastBar.current = data.bars.length > 0 ? data.bars[data.bars.length - 1] : null;
    if (lastBar.current) containerRef.current?.setAttribute('data-last-bar', `${lastBar.current.time}:${lastBar.current.close}`);
    if (followTail) {
      const n = data.points.length;
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - VISIBLE_BARS), to: n + 3 });
      return;
    }
    // Nur bei neuer Auswahl ausrichten; das Nachladen des Endstücks lässt die Ansicht stehen
    if (fittedKey.current === viewKey || data.points.length === 0) return;
    const n = data.points.length;
    // autoSize setzt die Breite erst nach dem ersten ResizeObserver-Lauf; vorher bliebe die Ansicht
    // beim Standard-Kerzenabstand stehen
    let frame = 0;
    let tries = 0;
    let previousWidth = -1;
    let stableFrames = 0;
    const align = () => {
      const width = chart.timeScale().width();
      stableFrames = width > 0 && width === previousWidth ? stableFrames + 1 : 0;
      previousWidth = width;
      // Indikatorachsen können die verfügbare Breite nach dem ersten Layout noch ändern.
      if (stableFrames < 2 && tries++ < 60) {
        frame = requestAnimationFrame(align);
        return;
      }
      // Erst eine tatsächlich ausgeführte Ausrichtung gilt als fertig. Ein neuer Render
      // kann den geplanten Frame vorher abbrechen und muss ihn dann erneut planen.
      fittedKey.current = viewKey;
      setAlignedView(viewKey);
      forgetView.current?.();
      forgetView.current = null;
      // Analyse und freier Chart zeigen alle Kerzen oder den gespeicherten Zoom; der Backtest die letzten VISIBLE_BARS
      if (!workspaceKey || (workspaceView !== 'analysis' && workspaceView !== 'free')) {
        chart.timeScale().setVisibleLogicalRange({ from: n <= FIT_MAX_POINTS ? -1 : n - VISIBLE_BARS, to: n + 3 });
        return;
      }
      restoreChartView(chart, data.points.map(p => p.time), useChartWorkspaceStore.getState().documents[workspaceKey]?.visibleTime);
      forgetView.current = rememberChartView(chart, el, workspaceKey, () => pointsRef.current.length);
    };
    // Erst nach dem ersten ResizeObserver-Lauf ausrichten; eine zu frühe Wiederherstellung
    // wird beim Wechsel zwischen Seitenbreiten sonst an den Chart-Rand geklemmt.
    frame = requestAnimationFrame(align);
    return () => cancelAnimationFrame(frame);
  }, [data, appearance, viewKey, followTail, workspaceKey, workspaceView]);

  // Fehlende Bereiche und Marktpausen (beide abschaltbar)
  useEffect(() => {
    if (!colors || !primitives.current) return;
    primitives.current.missing.set(showGaps ? data.missing : [], {
      fill: withAlpha(colors.muted, 0.1),
      stripe: withAlpha(colors.muted, 0.28),
      text: colors.muted,
      label: t('analysis.chart.noData'),
    });
    primitives.current.pauses.set(showPauses ? data.pauses : [], withAlpha(colors.muted, 0.55));
  }, [data, colors, showPauses, showGaps, t]);

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

  // Laufende Kerze aus dem Live-Preis (nur die aktuelle oder die direkt folgende Zeitspanne)
  useEffect(() => {
    if (!live || !candlesRef.current) return;
    const bar = liveBar(lastBar.current, live.price, live.nowSec, timeframeSec);
    // Nie vor dem letzten Punkt (z. B. eine Leerstelle nach der letzten Kerze): update() würde werfen
    const lastPoint = data.points[data.points.length - 1];
    if (!bar || (lastPoint && bar.time < lastPoint.time)) return;
    const last = data.bars.at(-1), previous = last?.time === bar.time ? data.bars.at(-2) : last;
    const c = appearanceColors(appearance);
    const override = appearance.previous && previous ? { color: previousColor(bar.close >= previous.close, appearance.body, c.up, c.down), borderColor: bar.close >= previous.close ? c.borderUp : c.borderDown, wickColor: bar.close >= previous.close ? c.wickUp : c.wickDown } : {};
    candlesRef.current.update({ ...bar, ...override, time: bar.time as UTCTimestamp });
    lastBar.current = bar;
    const frame = requestAnimationFrame(() => setWorkspaceTail({ key: viewKey, bar }));
    // Stand der letzten Kerze am Element (Tests und Fehlersuche; der Chart zeichnet in <canvas>)
    containerRef.current?.setAttribute('data-last-bar', `${bar.time}:${bar.close}`);
    return () => cancelAnimationFrame(frame);
  }, [live, timeframeSec, data.points, data.bars, viewKey, appearance]);

  // Nur unter dem Fadenkreuz: ohne Maus würde die Legende die geladene statt der laufenden Kerze zeigen
  const shown = hover?.bar ?? null;
  const allNotes = hover ? (notes?.get(hover.time) ?? []) : [];
  // Viele Trades in einer Kerze: nur die ersten, der Rest gezählt (sonst deckt die Legende den Chart zu)
  const hoverNotes =
    allNotes.length > MAX_HOVER_NOTES
      ? [...allNotes.slice(0, MAX_HOVER_NOTES), t('analysis.chart.notes.more', { n: allNotes.length - MAX_HOVER_NOTES })]
      : allNotes;
  return (
    <ChartWorkspace context={workspace ?? { key: viewKey, symbol: '', view: 'analysis' }} binding={binding} interactionReady={followTail || data.points.length === 0 || alignedView === viewKey} bars={effectiveBars} missing={data.missing} timeframeSec={timeframeSec} digits={digits} until={clockNow ?? (effectiveBars.at(-1)?.time ?? 0) + timeframeSec} countdownNow={clockNow} overlays={workspaceOverlays} showRsi={showRsi}>
    <div className="relative">
      <div
        className="pointer-events-none absolute left-2 top-1 z-10 flex flex-wrap gap-x-3 font-mono text-[11px] tabular-nums text-muted-foreground"
        data-testid="chart-legend"
      >
        {hover && !hover.bar && <span className="text-warning">{t('analysis.chart.noData')}</span>}
        {shown && appearance.ohlc &&
          (['open', 'high', 'low', 'close'] as const).map((k) => (
            <span key={k}>
              {t(`analysis.chart.ohlc.${k}`)} <span className="text-foreground">{fmt.price(shown[k], digits ?? undefined)}</span>
            </span>
          ))}
        {hoverNotes.map((n, i) => (
          <span key={i} className="basis-full text-foreground" data-testid="chart-legend-note">
            {n}
          </span>
        ))}
        {shown && appearance.change && <span>{fmt.number(shown.close - shown.open, { maximumFractionDigits: digits ?? 5 })}</span>}
      </div>
      {/* Die TradingView-Namensnennung (Link) erzeugt lightweight-charts selbst */}
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label={t('cw.canvas')}
        data-tooltip-exempt
        data-testid="analysis-chart"
        data-bars={data.bars.length}
        data-gap-areas={data.missing.length}
        data-gaps-shown={showGaps}
        data-lines={lines.length}
        data-pauses={data.pauses.length}
        className="h-[max(360px,calc(100dvh-22rem))] w-full [:fullscreen_&]:h-[calc(100dvh-12rem)]"
      />
    </div>
    </ChartWorkspace>
  );
}
