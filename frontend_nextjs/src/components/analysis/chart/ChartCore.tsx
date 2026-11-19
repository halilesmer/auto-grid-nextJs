'use client';

import { systemRsiOf } from '@/lib/chart-workspace/oscStandard';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type AutoscaleInfo,
  type CandlestickData,
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
import { isBar, liveBar, type Bar, type ChartData, type ChartPoint, type OlderEdge } from '@/lib/analysis/candles';
import type { Appearance } from '@/lib/chart-workspace/settings';
import { readChartColors, withAlpha, type ChartColors } from '@/lib/chartTheme';
import { useThemeStore } from '@/store';
import { ChartWorkspace, type WorkspaceContext } from '@/components/chart-workspace/ChartWorkspace';
import { type ChartBinding, MIN_BAR_SPACING_PX, createChartBinding, appearanceColors, openingView, fitWithGap, setRightGap, publishVisibleRange, type SystemSeriesRef, type SystemSeriesRefs } from '@/components/chart-workspace/runtime';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { clipSegments, type TrendSegment } from '@/lib/formation/trdPath';
import { canvasColor, dashArrayOf } from '@/lib/formation/lineStyle';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import {
  FractalsPrimitive,
  MissingDataPrimitive,
  PauseLinesPrimitive,
  TradeLinksPrimitive,
  TrendPathPrimitive,
  ZoneBandPrimitive,
  type FractalMark,
} from './primitives';
import { TrendLineMenuHost } from './TrendLineMenu';
import { OlderEdgeMark } from './OlderEdgeMark';
import { LatestBarButton } from './LatestBarButton';
import { DrawingToolBridge, watchPointerPressed } from './drawingBusy';

/** Höchstzahl der Schenkel in `data-trend-segments` */
const MAX_TEST_SEGMENTS = 40;

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


/** Was eine Zeichenfläche über dem Chart braucht, um Zeit und Preis in Koordinaten umzurechnen */
export interface ChartScene {
  binding: ChartBinding;
  /** Series of the system panes while they are drawn (the renderer of the chart workspace owns them); `current` is null when the layer is off or hidden */
  rsi: SystemSeriesRef;
}

export interface ChartCoreProps {
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
  /** Nur für Charts ohne System-RSI (Backtest): false blendet den Standard-RSI(14) aus */
  showRsi?: boolean;
  /** Live-Preis des Streams für die laufende Kerze; null = keine Live-Kerze (anderes Symbol, Uhr unsicher) */
  live: { price: number; nowSec: number } | null;
  /** Trades aus dem Archiv: Pfeile, Ausstiege, Verbindungen (leer = aus) */
  markers?: TradeMarker[];
  links?: TradeLinkLine[];
  fractals?: FractalPoint[];
  /** Trendzug (ANA-21); was außerhalb der Kerzen liegt, schneidet der Chart ab */
  trendPath?: { segments: TrendSegment[]; axis: number[] };
  /** Schalter in der Kopfleiste des Charts, rechts neben den Indikatoren */
  toolbarActions?: React.ReactNode;
  /** Symbolleisten-Schalter direkt hinter „Ansicht zurücksetzen“ (z. B. Formasyon çizimleri) */
  viewActions?: React.ReactNode;
  /** Zusatzzeilen unter dem Fadenkreuz je Kerzenzeit (z. B. Trades dieser Kerze) */
  notes?: Map<number, string[]>;
  /** Ansicht auf diese Kerzenzeit setzen; `seq` erzwingt es auch bei gleicher Zeit erneut */
  focus?: { time: number; seq: number } | null;
  /** Backtest-only realized balance and equity areas in the lower pane. */
  balance?: { time: number; value: number }[];
  equity?: { time: number; value: number }[];
  /** Keep the right edge on the replay cursor while candles are revealed. */
  followTail?: boolean;
  /** Laufende Kerze nach der letzten geschlossenen, nur zur Anzeige: Indikatoren und Zeichnungen enden davor */
  runningBar?: Bar | null;
  /** Preise außerhalb der Kerzen, bis zu denen die Preisachse reicht */
  priceRange?: { min: number; max: number } | null;
  /** Ränder der Preisachse je Chartbreite, solange der Nutzer keine eigenen gesetzt hat */
  marginsFor?: (width: number) => { top: number; bottom: number };
  /** Letzter Zeitpunkt für Zeichnungen und Indikatoren; ohne Angabe die Uhr bzw. das Ende der letzten Kerze */
  until?: number;
  /** Chart füllt die ganze Fläche, die Bedienung liegt darauf (bis alle Seiten so aussehen: Journal 2026-11-01) */
  overlayLayout?: boolean;
  /** Vollbild der ganzen Chartseite statt nur des Charts (ChartPage) */
  fullscreenOfPage?: boolean;
  surfaceProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>;
  /** Zeichenfläche über dem Chart; nur mit overlayLayout */
  renderOverlay?: (scene: ChartScene) => ReactNode;
  /** Ältere Kerzen laden (Serbest kip): kommt der Chart bis OLDER_TRIGGER_BARS an die erste Kerze, wird das aufgerufen */
  onNeedOlder?: () => void;
  /** Stand links: `loading` = Seite wird geladen, sonst der Grund, warum links Schluss ist; null = nichts anzeigen */
  olderEdge?: 'loading' | OlderEdge | null;
  /**
   * Einmal alle Kerzen einpassen (der Nutzer hat oben einen Zeitraum gewählt, 1118-A5.1): jede neue Zahl passt einmal ein, sobald
   * die Ansicht dieser Auswahl steht; danach meldet `onFitted` die Zahl. null = nichts zu tun. Kein Modus: neue Kerzen und ein
   * neues Öffnen zeigen danach wieder das Verhalten der Bibliothek und die Öffnungsansicht.
   */
  fitOnce?: number | null;
  onFitted?: (seq: number) => void;
}

const EMPTY_MARKERS: TradeMarker[] = [];
const EMPTY_LINKS: TradeLinkLine[] = [];
const EMPTY_FRACTALS: FractalPoint[] = [];
const EMPTY_TREND = { segments: [] as TrendSegment[], axis: [] as number[] };
/** Ab so vielen Trade-Markern werden Pfeile kleiner und Verbindungen blasser (sonst verdecken sie die Kerzen) */
const DENSE_MARKERS = 200;
/** Höchstens so viele Trade-Zeilen unter dem Fadenkreuz */
const MAX_HOVER_NOTES = 4;
/** Beim Springen zu einem Trade: so viele Kerzen links und rechts davon */
const FOCUS_BARS = 60;

/** Bis zu so vielen Punkten passt der Backtest den ganzen Zeitraum ein, sonst die letzten VISIBLE_BARS */
const FIT_MAX_POINTS = 2000;
const VISIBLE_BARS = 300;
/** Bleiben links so wenige Kerzen übrig, werden ältere nachgeladen (Serbest kip, 1107-A4) */
const OLDER_TRIGGER_BARS = 50;
/**
 * Ältere Kerzen laden nur durch eine Bewegung des Nutzers (1118-A3.1 = C): während er den Chart zieht, und so lange nach dem letzten
 * Rad- oder Wischschritt. Ein Klick allein zählt nicht: eine Änderung des Bereichs von selbst (neue Kerze, Einpassen, setData,
 * neue Breite) kurz nach einem Klick holte sonst eine Seite (Journal 2026-11-17-chart-older-page-dock-scan-findings §3)
 */
const GESTURE_WINDOW_MS = 400;
/** Nach dem Loslassen eines Wischens läuft der Schwung (kineticScroll von touch) weiter; so lange zählt die Bewegung noch */
const SWIPE_WINDOW_MS = 1000;
/** Ab so vielen Pixeln vom Druckpunkt ist ein Druck ein Ziehen, kein Klick mit Zittern */
const DRAG_START_PX = 3;

function previousColor(up: boolean, body: boolean, positive: string, negative: string) { if (!body) return 'transparent'; return up ? positive : negative; }
/** Farben einer Kerze, wenn sie sich nach dem Schluss der vorigen Kerze richten (Einstellung „previous“) */
function previousStyle(up: boolean, body: boolean, c: ReturnType<typeof appearanceColors>) {
  return { color: previousColor(up, body, c.up, c.down), borderColor: up ? c.borderUp : c.borderDown, wickColor: up ? c.wickUp : c.wickDown };
}
function seriesPoints(points: readonly ChartPoint[], appearance: Appearance) {
  const c = appearanceColors(appearance);
  return points.map((p, i) => {
    const prev = points[i - 1];
    const override = appearance.previous && isBar(p) && prev && isBar(prev) ? previousStyle(p.close >= prev.close, appearance.body, c) : {};
    return { ...p, ...override, time: p.time as UTCTimestamp };
  });
}
const LINE_STYLE = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted } as const;

/**
 * Schreibt die laufende Kerze (Formationssuche) oder die Live-Kerze (Stream). Eine neue Kerze rechts schiebt lightweight-charts die
 * Ansicht um eine Kerze weiter, wenn die letzte Kerze sichtbar ist (`shiftVisibleRangeOnNewBar`); das bleibt so, auch wenn die
 * Ansicht alle Kerzen zeigt: kein neues Einpassen (1118-A2.1 = B, wie TradingView).
 */
function writeLastBar(candles: ISeriesApi<'Candlestick'>, item: CandlestickData<UTCTimestamp>) {
  candles.update(item);
}

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
  showRsi = true,
  live,
  markers = EMPTY_MARKERS,
  links = EMPTY_LINKS,
  fractals = EMPTY_FRACTALS,
  trendPath = EMPTY_TREND,
  toolbarActions,
  viewActions,
  notes,
  focus,
  balance,
  equity,
  followTail = false,
  runningBar = null,
  priceRange,
  marginsFor,
  until,
  overlayLayout = false,
  fullscreenOfPage = false,
  surfaceProps,
  renderOverlay,
  onNeedOlder,
  olderEdge = null,
  fitOnce = null,
  onFitted,
}: ChartCoreProps) {
  const t = useT();
  const fmt = useFormat();
  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  // Der Renderer des Arbeitsbereichs trägt die Reihen der System-Bereiche ein; die Refs selbst bleiben für die Lebenszeit des Charts gleich
  const [systemSeries] = useState<SystemSeriesRefs>(() => ({ rsi: { current: null } }));
  const [scene, setScene] = useState<ChartScene | null>(null);
  const binding = scene?.binding ?? null;
  const shownRunning = useRef<{ view: string; bar: Bar } | null>(null);
  // Laufende Kerze der Suche gezeigt (1) oder nicht (0)
  const runningCount = useRef(0);
  const [alignedView, setAlignedView] = useState<string | null>(null);
  const [workspaceTail, setWorkspaceTail] = useState<{ key: string; bar: Bar } | null>(null);
  const appearance = useChartWorkspaceStore(useShallow(s => s.preview ?? s.appearance));
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
    trend: TrendPathPrimitive;
  } | null>(null);
  const markersApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLines = useRef<IPriceLine[]>([]);
  const lastBar = useRef<Bar | null>(null);
  const fittedKey = useRef<string | null>(null);
  const checkOlder = useRef<(() => void) | null>(null);
  // Bis wann eine Bewegung des Nutzers zählt (Rad, Wischen) und ob er gerade zieht (für das Laden älterer Kerzen)
  const gestureUntil = useRef(-Infinity);
  const dragging = useRef(false);
  const keepViewFrame = useRef(0);
  // Bis zur Korrektur der Ansicht nach einer Seite älterer Kerzen sieht check() noch die verschobene Ansicht und holte sonst unnötig eine weitere Seite
  const viewFixPending = useRef(false);
  const needOlder = useRef(onNeedOlder);
  const currentViewKey = useRef(viewKey);
  useEffect(() => {
    needOlder.current = onNeedOlder;
    currentViewKey.current = viewKey;
  });
  const workspaceKey = workspace?.key;
  const workspaceView = workspace?.view;
  const forgetView = useRef<(() => void) | null>(null);
  // Einmal einpassen: die zuletzt erledigte Zahl, und die aktuelle Anfrage für align() (läuft in einem späteren Bild)
  const fittedOnce = useRef<number | null>(null);
  const fitRequest = useRef<{ seq: number | null; done?: (seq: number) => void }>({ seq: fitOnce, done: onFitted });
  useEffect(() => {
    fitRequest.current = { seq: fitOnce, done: onFitted };
  });
  const pointsRef = useRef(data.points);
  // Die Kerzen, die der Chart in diesem Render bekommt. Andere Reihen teilen die Zeitachse und bekommen eine Seite älterer Kerzen
  // schon vor der Kerzenreihe (die Indikator-Reihen im Effekt von ChartWorkspace, einer Kindkomponente): die Zeitachse ist dann um
  // die neuen Kerzen länger, die Kerzenreihe noch nicht. check() läse barsBefore aus der alten Kerzenreihe und holte gleich die
  // nächste Seite (ANA-27, Journal 2026-11-17-chart-older-page-dock-scan-findings). Layout-Effekt: läuft vor allen Effekten des Commits
  const incomingPoints = useRef(data.points);
  useLayoutEffect(() => {
    incomingPoints.current = data.points;
  }, [data.points]);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const [colors, setColors] = useState<ChartColors | null>(null);
  const [hover, setHover] = useState<{ bar: Bar | null; time: number } | null>(null);

  const barByTime = useMemo(() => new Map(data.bars.map((b) => [b.time, b])), [data.bars]);
  const barByTimeRef = useRef(barByTime);
  useEffect(() => {
    barByTimeRef.current = barByTime;
  }, [barByTime]);

  const hasCurves = !!(balance || equity);
  const hasRsi = !!workspace?.systemRsi;
  const hasNotes = notes !== undefined;
  const marginsForRef = useRef(marginsFor);
  useEffect(() => {
    marginsForRef.current = marginsFor;
  }, [marginsFor]);
  // Chart einmal anlegen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        // Das Layout vom Modus Formation von /chart ist die Vorlage: es behält die Schrift und die Ränder des Charts
        ...(overlayLayout ? {} : { fontFamily: 'var(--font-geist-mono), ui-monospace, monospace' }),
        fontSize: 11,
        panes: { separatorColor: 'transparent' },
      },
      timeScale: { timeVisible: true, secondsVisible: false, minBarSpacing: MIN_BAR_SPACING_PX },
      ...(overlayLayout ? {} : { rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.08 } } }),
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
    const margins = marginsForRef.current;
    if (margins) candles.priceScale().applyOptions({ scaleMargins: margins(el.clientWidth) });
    // Die System-Bereiche RSI(7) legt der Renderer des Arbeitsbereichs an (UI-11): ein Bereich je eingeschalteter Ebene
    const band = new ZoneBandPrimitive();
    const missing = new MissingDataPrimitive();
    const pauses = new PauseLinesPrimitive();
    const links = new TradeLinksPrimitive();
    const fractalMarks = new FractalsPrimitive();
    const trend = new TrendPathPrimitive();
    candles.attachPrimitive(band);
    candles.attachPrimitive(missing);
    candles.attachPrimitive(pauses);
    candles.attachPrimitive(links);
    candles.attachPrimitive(fractalMarks);
    candles.attachPrimitive(trend);
    markersApi.current = createSeriesMarkers(candles, []);
    const attached = createChartBinding(chart, candles, el, margins ? () => margins(el.clientWidth) : undefined);
    const readyFrame = requestAnimationFrame(() => setScene({ binding: attached, rsi: systemSeries.rsi }));
    chartRef.current = chart;
    candlesRef.current = candles;
    balanceRef.current = balanceSeries;
    equityRef.current = equitySeries;
    primitives.current = { band, missing, pauses, links, fractals: fractalMarks, trend };

    const onMove = (param: MouseEventParams<Time>) => {
      if (param.time === undefined) {
        setHover(null);
        return;
      }
      const time = Number(param.time);
      const bar = barByTimeRef.current.get(time) ?? null;
      // Gleiche Kerze: kein neuer Zustand, sonst rendert jede Mausbewegung den Chart neu
      setHover((prev) => (prev && prev.time === time && prev.bar === bar ? prev : { bar, time }));
    };
    // OHLC unter dem Fadenkreuz gibt es nur im Layout mit Karte; die Trade-Notizen (notes) gibt es in beiden
    if (!overlayLayout || hasNotes) chart.subscribeCrosshairMove(onMove);
    return () => {
      forgetView.current?.();
      forgetView.current = null;
      cancelAnimationFrame(readyFrame);
      cancelAnimationFrame(keepViewFrame.current);
      viewFixPending.current = false;
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
      shownRunning.current = null;
      runningCount.current = 0;
    };
  }, [hasCurves, hasNotes, overlayLayout, systemSeries]);

  // Der Abstand für die Bedienung auf dem Chart hängt von der Breite ab
  useEffect(() => {
    if (!binding || !marginsFor) return;
    const { host, candles } = binding;
    let lastWidth = host.clientWidth;
    const observer = new ResizeObserver(() => {
      if (lastWidth === host.clientWidth) return;
      lastWidth = host.clientWidth;
      const settings = useChartWorkspaceStore.getState();
      if (!(settings.preview ?? settings.appearance).marginsSet) candles.priceScale().applyOptions({ scaleMargins: marginsFor(lastWidth) });
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [binding, marginsFor]);

  // Zonen und Level können außerhalb der Kerzen liegen: die Preisachse reicht bis zu ihnen.
  // Die Achse springt dabei (die Formationssuche liefert die Seiten oft erst nach dem Öffnen): während ein Zeichenwerkzeug aktiv ist
  // oder ein Zeiger auf dem Chart gedrückt ist, wartet die Änderung, damit ein gesetzter Punkt nicht von seinem Pixel wegwandert.
  // Danach gilt der letzte Wert (auch `null`).
  // Grenzen: bleibt ein Werkzeug dauerhaft gewählt, kommt die Ausweitung erst, wenn es endet. Zur Zeitachse bei der laufenden Kerze: writeLastBar.
  const toolRef = useRef<() => boolean>(() => false);
  // Der Zeiger wird für den ganzen Chart verfolgt, nicht je Änderung: ein Zug, der vor der Änderung begann, zählt mit
  const pressedRef = useRef<() => boolean>(() => false);
  useEffect(() => {
    if (!binding) return;
    const pointer = watchPointerPressed(binding.host);
    pressedRef.current = pointer.pressed;
    return () => { pointer.dispose(); pressedRef.current = () => false; };
  }, [binding]);
  useEffect(() => {
    if (priceRange === undefined || !binding) return;
    const { candles } = binding;
    const apply = () => candles.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const base = original();
        if (!base?.priceRange || !priceRange) return base;
        return { ...base, priceRange: { minValue: Math.min(base.priceRange.minValue, priceRange.min), maxValue: Math.max(base.priceRange.maxValue, priceRange.max) } };
      },
    });
    let frame = 0;
    const tryApply = () => {
      frame = 0;
      if (binding.isDisposed()) return;
      if (toolRef.current() || pressedRef.current()) { frame = requestAnimationFrame(tryApply); return; }
      apply();
    };
    tryApply();
    return () => cancelAnimationFrame(frame);
  }, [priceRange, binding]);

  // The RSI is an indicator now: drawn = layer on and the eye open
  const rsiDrawn = useChartWorkspaceStore(s => {
    const doc = workspaceKey ? s.documents[workspaceKey] : undefined;
    return (doc?.overlays.rsi ?? true) && (systemRsiOf(s, workspaceKey || undefined)?.visible ?? true);
  });
  useEffect(() => {
    if (hasRsi) containerRef.current?.setAttribute('data-rsi-visible', String(rsiDrawn));
  }, [rsiDrawn, hasRsi]);

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

  // Eine neue Auswahl ändert die Zeitachse, das ist kein Zoom der alten. Layout-Effekt: ChartWorkspace setzt die
  // Indikatoren als Kindkomponente in seinem Effekt, also vor jedem useEffect hier
  useLayoutEffect(() => {
    forgetView.current?.();
    forgetView.current = null;
  }, [viewKey]);

  // Kerzen + Leerstellen
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candlesRef.current;
    const el = containerRef.current;
    if (!chart || !candles || !el) return;
    // Ältere Kerzen davor: der Chart ordnet die Kerzen neu und lässt die Ansicht je nach Lage der Reihen (die Indikator-Reihen teilen
    // die Zeitachse) an der Zeit oder am Index stehen; bei Index springt sie um die neuen Kerzen. Darum die sichtbare Zeit
    // merken und im nächsten Bild, wenn der Chart den Bereich übernommen hat, nur bei Abweichung zurückschieben
    const previousFirst = pointsRef.current[0]?.time;
    const previousTimes = fittedKey.current === viewKey ? chart.timeScale().getVisibleRange() : null;
    pointsRef.current = data.points;
    candles.setData(seriesPoints(data.points, appearance));
    if (previousTimes && previousFirst !== undefined && data.points.length > 0 && data.points[0].time < previousFirst) {
      const points = data.points;
      cancelAnimationFrame(keepViewFrame.current);
      viewFixPending.current = true;
      keepViewFrame.current = requestAnimationFrame(() => {
        viewFixPending.current = false;
        const scale = chart.timeScale();
        const times = scale.getVisibleRange(), logical = scale.getVisibleLogicalRange();
        if (!times || !logical) return;
        const wanted = points.findIndex((p) => p.time >= Number(previousTimes.from));
        const shown = points.findIndex((p) => p.time >= Number(times.from));
        if (wanted < 0 || shown < 0 || wanted === shown) return;
        scale.setVisibleLogicalRange({ from: logical.from + (wanted - shown), to: logical.to + (wanted - shown) });
      });
    }
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
      // Der Backtest zeigt die letzten VISIBLE_BARS (bis FIT_MAX_POINTS alle); alle anderen öffnen wie TradingView mit den letzten
      // Kerzen im Standard-Kerzenabstand (1118-A5.1), außer der Nutzer hat oben gerade einen Zeitraum gewählt: dann einmal alle
      if (!workspaceKey || workspaceView === 'backtest') {
        setRightGap(chart, 0);
        chart.timeScale().setVisibleLogicalRange({ from: n <= FIT_MAX_POINTS ? -1 : n - VISIBLE_BARS, to: n + 3 });
        return;
      }
      const request = fitRequest.current;
      if (request.seq !== null && request.seq !== fittedOnce.current) {
        fittedOnce.current = request.seq;
        fitWithGap(chart);
        request.done?.(request.seq);
      } else openingView(chart);
      forgetView.current = publishVisibleRange(chart, surfaceRef.current ? [el, surfaceRef.current] : [el]);
    };
    // Erst nach dem ersten ResizeObserver-Lauf ausrichten; eine zu frühe Wiederherstellung
    // wird beim Wechsel zwischen Seitenbreiten sonst an den Chart-Rand geklemmt.
    frame = requestAnimationFrame(align);
    return () => cancelAnimationFrame(frame);
  }, [data, appearance, viewKey, followTail, workspaceKey, workspaceView]);

  // Ältere Kerzen: nahe an der ersten Kerze nachladen (nur Serbest kip, nur nach der Ausrichtung der Ansicht)
  useEffect(() => {
    if (!binding) return;
    const { chart, candles } = binding;
    // Die Zeichenfläche und die Bedienung liegen über dem Chart, darum an der Fläche lauschen, nicht am Chart-Element
    const host = surfaceRef.current ?? binding.host;
    // Bewegungen des Nutzers: Rad, Ziehen mit der linken Taste ab einem Druck auf dem Chart, Wischen (danach läuft der Schwung von
    // touch noch nach). Ein Klick oder Tippen allein (auch mit etwas Zittern) zählt nicht
    const mark = (ms: number) => { gestureUntil.current = Math.max(gestureUntil.current, performance.now() + ms); };
    const wheel = () => mark(GESTURE_WINDOW_MS);
    let press: { x: number; y: number } | null = null;
    let touchMoved = false;
    // In der Capture-Phase am Fenster: ein stopPropagation einer Ebene über dem Chart soll den Druck nicht verstecken
    const down = (event: PointerEvent) => {
      const onChart = event.target instanceof Node && host.contains(event.target);
      press = onChart && event.pointerType !== 'touch' && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const move = (event: PointerEvent) => {
      if (!press || !(event.buttons & 1)) return;
      if (!dragging.current && Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_START_PX) return;
      dragging.current = true;
      mark(GESTURE_WINDOW_MS);
    };
    const release = () => { press = null; dragging.current = false; };
    const touchMove = () => { touchMoved = true; mark(GESTURE_WINDOW_MS); };
    const touchEnd = () => { if (touchMoved) mark(SWIPE_WINDOW_MS); touchMoved = false; };
    const touchCancel = () => { touchMoved = false; };
    host.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('pointerdown', down, { capture: true, passive: true });
    window.addEventListener('pointermove', move, { capture: true, passive: true });
    host.addEventListener('touchmove', touchMove, { passive: true });
    host.addEventListener('touchend', touchEnd, { passive: true });
    host.addEventListener('touchcancel', touchCancel, { passive: true });
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    const check = () => {
      if (!needOlder.current || viewFixPending.current || fittedKey.current !== currentViewKey.current) return;
      // Die Kerzenreihe hat die neuen Kerzen noch nicht, die Zeitachse schon: barsBefore wäre zu klein
      if (pointsRef.current !== incomingPoints.current) return;
      if (!dragging.current && performance.now() > gestureUntil.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const info = range ? candles.barsInLogicalRange(range) : null;
      if (info && info.barsBefore < OLDER_TRIGGER_BARS) needOlder.current();
    };
    checkOlder.current = check;
    chart.timeScale().subscribeVisibleLogicalRangeChange(check);
    return () => {
      checkOlder.current = null;
      host.removeEventListener('wheel', wheel);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      host.removeEventListener('touchmove', touchMove);
      host.removeEventListener('touchend', touchEnd);
      host.removeEventListener('touchcancel', touchCancel);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      dragging.current = false;
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(check); } catch { /* Chart schon entfernt */ }
    };
  }, [binding]);
  // Eine Seite ist angekommen: zieht der Nutzer noch und reicht die Ansicht an den linken Rand, gleich die nächste holen
  useEffect(() => {
    if (olderEdge !== null) return;
    const frame = requestAnimationFrame(() => checkOlder.current?.());
    return () => cancelAnimationFrame(frame);
  }, [olderEdge, data.points]);

  // Derselbe Zeitraum noch einmal gewählt (oder die Ansicht stand schon): gleich einpassen. Sonst passt align() ein, sobald die
  // Kerzen der neuen Auswahl da sind
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || fitOnce === null || fitOnce === fittedOnce.current || fittedKey.current !== viewKey) return;
    fittedOnce.current = fitOnce;
    fitWithGap(chart);
    onFitted?.(fitOnce);
  }, [fitOnce, onFitted, viewKey, alignedView]);

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

  // Trendzug: Farben der Kerzen, Saum in der Panelfarbe; außerhalb der geladenen Kerzen abgeschnitten
  const trendUp = useAnalysisPrefsStore(s => s.formationStyle.trendUp);
  const trendDown = useAnalysisPrefsStore(s => s.formationStyle.trendDown);
  useEffect(() => {
    if (!colors || !primitives.current) return;
    const first = data.bars[0]?.time, last = data.bars.at(-1)?.time;
    const c = appearanceColors(appearance);
    const tones = { up: c.up === c.background ? c.borderUp : c.up, down: c.down === c.background ? c.borderDown : c.down };
    // Preset „classic“: beide Kerzenfarben fallen zusammen, dann tragen die Themefarben die Richtung
    if (tones.up === tones.down) { tones.up = colors.up; tones.down = colors.down; }
    // Canvas kennt var(--…) nicht und ignoriert es still (die Linie bekäme die Saumfarbe): vorher zur echten Farbe lösen
    const host = containerRef.current;
    const resolve = (color: string) => canvasColor(color, (name) => (host ? getComputedStyle(host).getPropertyValue(name) : ''));
    const drawn = first === undefined || last === undefined ? [] : clipSegments(trendPath.segments, first, last, trendPath.axis).flatMap((s) => {
      const spec = s.tone === 'up' ? trendUp : trendDown;
      return spec.visible ? [{ from: s.from, to: s.to, color: resolve(spec.color) || tones[s.tone], width: spec.width, dash: dashArrayOf(spec.style) }] : [];
    });
    primitives.current.trend.set(drawn, c.background);
    primitives.current.trend.setInteractive(appearance.lineMenu !== 'off');
    host?.setAttribute('data-trend', String(drawn.length));
    // Stil der Trendlinie am Element (Tests: die Linie ist Canvas und sonst nicht lesbar); Typ und Dicke gelten je Richtung
    host?.setAttribute('data-trend-width', String(trendUp.width));
    host?.setAttribute('data-trend-width-down', String(trendDown.width));
    host?.setAttribute('data-trend-style', trendUp.style);
    host?.setAttribute('data-trend-style-down', trendDown.style);
    host?.setAttribute('data-trend-color', `${trendUp.color},${trendDown.color}`);
  }, [trendPath, colors, data, appearance, trendUp, trendDown]);

  // Sichtbare Schenkel der Linie (Pixel ab Chart-Rand) am Element: die Linie ist Canvas, Tests finden sonst keinen Punkt auf ihr. Nur bei Änderung schreiben.
  useEffect(() => {
    const trend = primitives.current?.trend, host = containerRef.current;
    if (!trend || !host) return;
    let last = '';
    trend.listenLayout((segments) => {
      const left = chartRef.current?.priceScale('left').width() ?? 0;
      const value = segments.slice(0, MAX_TEST_SEGMENTS).map((s) => [s.x1 + left, s.y1, s.x2 + left, s.y2].map(Math.round).join(',')).join(';');
      if (value === last) return;
      last = value;
      if (value) host.setAttribute('data-trend-segments', value); else host.removeAttribute('data-trend-segments');
    });
    return () => trend.listenLayout(null);
  }, [scene]);

  // Auch ohne Chart (der Kerzen-Effekt kehrt dann früh zurück): check() vergleicht pointsRef mit incomingPoints und bliebe sonst gesperrt
  useEffect(() => {
    pointsRef.current = data.points;
  }, [data.points]);
  // Zu einem Trade springen (Klick in der Trade-Liste); nur bei neuem Klick, nicht nach jedem Nachladen
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
    const override = appearance.previous && previous ? previousStyle(bar.close >= previous.close, appearance.body, appearanceColors(appearance)) : {};
    writeLastBar(candlesRef.current, { ...bar, ...override, time: bar.time as UTCTimestamp });
    lastBar.current = bar;
    const frame = requestAnimationFrame(() => setWorkspaceTail({ key: viewKey, bar }));
    // Stand der letzten Kerze am Element (Tests und Fehlersuche; der Chart zeichnet in <canvas>)
    containerRef.current?.setAttribute('data-last-bar', `${bar.time}:${bar.close}`);
    return () => cancelAnimationFrame(frame);
  }, [live, timeframeSec, data.points, data.bars, viewKey, appearance]);

  useEffect(() => {
    const candles = candlesRef.current;
    if (!candles) return;
    const closed = data.bars.at(-1);
    // Nie vor oder auf der letzten geschlossenen Kerze schreiben: update() würde die Kerze ersetzen oder werfen
    if (!closed || !runningBar || runningBar.time <= closed.time) {
      if (runningCount.current) {
        candles.setData(seriesPoints(data.points, appearance));
      }
      runningCount.current = 0;
      shownRunning.current = null;
      surfaceRef.current?.removeAttribute('data-last-price');
      return;
    }
    runningCount.current = 1;
    // Schon gezeigte Extremwerte bleiben, solange es dieselbe Kerze ist (der Preis kann wieder zurückgehen);
    // die Kerze einer anderen Zeiteinheit kann dieselbe Öffnungszeit haben
    const shown = shownRunning.current;
    const prev = shown?.view === viewKey && shown.bar.time === runningBar.time ? shown.bar : null;
    const bar = prev ? { ...runningBar, high: Math.max(runningBar.high, prev.high), low: Math.min(runningBar.low, prev.low) } : runningBar;
    shownRunning.current = { view: viewKey, bar };
    const style = appearance.previous ? previousStyle(bar.close >= closed.close, appearance.body, appearanceColors(appearance)) : {};
    writeLastBar(candles, { ...bar, ...style, time: bar.time as UTCTimestamp });
    // Stand der letzten Kerze am Element (Tests und Fehlersuche; der Chart zeichnet in <canvas>)
    surfaceRef.current?.setAttribute('data-last-price', `${runningBar.time}:${runningBar.close}`);
    surfaceRef.current?.setAttribute('data-last-range', `${bar.low}:${bar.high}`);
  }, [runningBar, data, appearance, viewKey]);

  // Nur unter dem Fadenkreuz: ohne Maus würde die Legende die geladene statt der laufenden Kerze zeigen
  const shown = hover?.bar ?? null;
  const allNotes = hover ? (notes?.get(hover.time) ?? []) : [];
  // Viele Trades in einer Kerze: nur die ersten, der Rest gezählt (sonst deckt die Legende den Chart zu)
  const hoverNotes =
    allNotes.length > MAX_HOVER_NOTES
      ? [...allNotes.slice(0, MAX_HOVER_NOTES), t('analysis.chart.notes.more', { n: allNotes.length - MAX_HOVER_NOTES })]
      : allNotes;
  // Menü der Trendlinie (Rechtsklick/Doppelklick auf die Linie); im Arbeitsbereich, damit es das aktive Zeichenwerkzeug kennt
  const trendMenu = scene && !scene.binding.isDisposed() ? <TrendLineMenuHost chart={scene.binding.chart} host={scene.binding.host} lineMenu={appearance.lineMenu} /> : null;
  const hostAttributes = {
    ref: containerRef,
    tabIndex: 0,
    'aria-label': t('cw.canvas'),
    'data-tooltip-exempt': true,
    'data-testid': 'analysis-chart',
    'data-bars': data.bars.length,
    'data-gap-areas': data.missing.length,
    'data-gaps-shown': showGaps,
    'data-pauses-shown': showPauses,
    'data-lines': lines.length,
    'data-pauses': data.pauses.length,
  };
  return (
    <ChartWorkspace context={workspace ?? { key: viewKey, symbol: '', view: 'analysis' }} binding={binding} interactionReady={followTail || data.points.length === 0 || alignedView === viewKey} bars={effectiveBars} missing={data.missing} timeframeSec={timeframeSec} digits={digits} until={until ?? clockNow ?? (effectiveBars.at(-1)?.time ?? 0) + timeframeSec} countdownNow={clockNow} overlays={workspaceOverlays} showRsi={showRsi} toolbarActions={toolbarActions} viewActions={viewActions} overlayLayout={overlayLayout} fullscreenOfPage={fullscreenOfPage} systemSeries={systemSeries}>
    <DrawingToolBridge toolRef={toolRef} />
    {overlayLayout ? (
      // Eigener Stapelkontext: die Canvases des Charts tragen z-index
      <div ref={surfaceRef} {...surfaceProps} className="absolute top-0 bottom-[calc(var(--workspace-card,0px)+var(--floating-card,0px))] left-[52px] right-0 isolate overflow-hidden bg-card @min-[71rem]/formation-main:bottom-0">
        <div {...hostAttributes} className="absolute inset-0" />
        {hoverNotes.length > 0 && (
          // Unten links über der Statuszeile: oben stehen die Hinweise der Seite
          <div className="pointer-events-none absolute bottom-9 left-[60px] z-10 flex max-w-[60%] flex-col gap-0.5 rounded bg-card/90 px-2 py-1 font-mono text-[11px] text-foreground" data-testid="chart-legend">
            {hoverNotes.map((n, i) => (
              <span key={i} data-testid="chart-legend-note">{n}</span>
            ))}
          </div>
        )}
        {scene && !scene.binding.isDisposed() && renderOverlay?.(scene)}
        <LatestBarButton binding={binding} />
        {olderEdge && <OlderEdgeMark binding={binding} state={olderEdge} firstTime={data.bars[0]?.time ?? null} />}
        {trendMenu}
      </div>
    ) : (
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
      <div {...hostAttributes} className="h-[max(360px,calc(100dvh-22rem))] w-full [:fullscreen_&]:h-[calc(100dvh-12rem)]" />
      {trendMenu}
    </div>
    )}
    </ChartWorkspace>
  );
}
