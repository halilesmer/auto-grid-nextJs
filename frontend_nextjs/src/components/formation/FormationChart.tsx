'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TIMEFRAME_SEC, type Bar } from '@/lib/analysis/candles';
import { useFormat, useT } from '@/i18n';
import { formationChartData } from '@/lib/formation/chartData';
import type { FormationBar } from '@/lib/formation/types';
import type { FormationContext } from '@/lib/formation/context';
import { drawingPriceRange, layoutDrawings, type DrawingGroup, type Prim, type Tone } from '@/lib/formation/drawingLayout';
import { FINAL_POINT, UPPER_TIMEFRAME, type ScanHit } from '@/lib/formation/scan';
import { captureChart, type ChartPicture } from '@/lib/formation/shotImage';
import { type ChartScene, type OverlayLine } from '@/components/analysis/chart/ChartCore';
import { ChartView } from '@/components/chart-page/ChartView';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { ContextOverlays, useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import { workspaceKey } from '@/lib/chart-workspace/settings';
import { TrendToggle } from '@/components/chart-workspace/TrendToggle';
import { buildTrendPath, usableTrendSettings } from '@/lib/formation/trdPath';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';

const TONE_COLOR: Record<Exclude<Tone, 'side'>, string> = {
  ratio: 'var(--secondary)',
  target: 'var(--warning)',
  zone: 'var(--info)',
  mark: 'var(--primary)',
  text: 'var(--foreground)',
};

const SIDE_COLOR = { buy: 'var(--success)', sell: 'var(--danger)' } as const;

const toneColor = (tone: Tone, side: 'buy' | 'sell'): string => (tone === 'side' ? SIDE_COLOR[side] : TONE_COLOR[tone]);

function PrimView({ prim, side }: { prim: Prim; side: 'buy' | 'sell' }) {
  const color = toneColor(prim.tone, side);
  switch (prim.kind) {
    case 'line': {
      let dash: string | undefined;
      if (prim.dashed) dash = '6 5';
      else if (prim.dotted) dash = '2 4';
      return (
        <>
          <line x1={prim.x1} y1={prim.y1} x2={prim.x2} y2={prim.y2} stroke={color} strokeWidth={prim.width ?? 1.4} strokeDasharray={dash} />
          <line x1={prim.x1} y1={prim.y1} x2={prim.x2} y2={prim.y2} stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke' }} />
        </>
      );
    }
    case 'rect':
      return (
        <rect
          x={prim.x}
          y={prim.y}
          width={prim.w}
          height={prim.h}
          fill={prim.tone === 'zone' || prim.tone === 'mark' ? color : 'none'}
          fillOpacity={prim.tone === 'mark' && prim.w <= 20 ? 0 : 0.16}
          stroke={color}
          strokeWidth={prim.w <= 20 ? 2 : 1}
          strokeDasharray={prim.dashed ? '4 3' : undefined}
          rx={prim.w <= 20 ? 3 : 0}
        />
      );
    case 'circle':
      return <circle cx={prim.x} cy={prim.y} r={prim.r} fill={prim.open ? 'none' : color} stroke={color} strokeWidth={2} />;
    case 'text':
      return (
        <text
          x={prim.x}
          y={prim.y}
          textAnchor={prim.anchor ?? 'start'}
          fill={color}
          stroke="var(--card)"
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
          fontSize={prim.bold ? 13 : 11}
          fontWeight={prim.bold ? 600 : 400}
        >
          {prim.text}
        </text>
      );
  }
}

interface Props {
  accountId: string;
  hit: ScanHit;
  context: FormationContext;
  scanAt: number;
  /** Laufende Kerze mit dem aktuellen Preis, nur zur Anzeige: Suche, RSI und Zeichnungen enden an der letzten geschlossenen Kerze */
  running: Bar | null;
  /** Stand in der Vergangenheit (FRM-38): gestrichelte Linie „Stand“ am Ende der Kerzen */
  asOf?: boolean;
  digits: number | null;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
  /** Meldet die Aufnahme des gezeigten Charts (Kerzen samt Zeichnungen) oder null, wenn der Chart abgebaut wird */
  onCapture: (capture: (() => Promise<ChartPicture>) | null) => void;
  /** Unterkante des Kerzen-Bereichs in px ab Oberkante des Charts; die Legende bleibt darüber */
  onPriceBottom: (px: number) => void;
}

const NO_LINES: OverlayLine[] = [];
const NO_BARS: FormationBar[] = [];
const NO_TREND = { segments: [], axis: [] };

/** Zeichnungen der Erkennung als SVG über dem Chart; das Overlay endet vor der Preisachse. */
function FormationOverlay({ scene, hit, bars, points, running, asOf, active, onActive, onCapture, onPriceBottom, visible, rsiVisible, waveVisible }: Pick<Props, 'hit' | 'running' | 'asOf' | 'active' | 'onActive' | 'onCapture' | 'onPriceBottom'> & { scene: ChartScene; bars: readonly Bar[]; /** Zeiten der Chart-Punkte: Kerzen plus Leerstellen der Datenlücken (der logische Index zählt beide) */ points: readonly { time: number }[]; visible: boolean; rsiVisible: boolean; waveVisible: boolean }) {
  const t = useT();
  const { number } = useFormat();
  const { binding, rsi, wave } = scene;
  const appearance = useChartWorkspaceStore(s => s.preview ?? s.appearance);
  const overlayRef = useRef<SVGSVGElement>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number; left: number; priceHeight: number; waveTop: number; groups: DrawingGroup[]; asOfX: number | null }>({ width: 0, height: 0, left: 0, priceHeight: 0, waveTop: 0, groups: [], asOfX: null });

  useEffect(() => {
    const { chart, host } = binding;
    onCapture(() => captureChart({ chart, host, overlay: overlayRef.current }));
    return () => onCapture(null);
  }, [binding, onCapture]);

  useEffect(() => {
    const { chart, candles, host } = binding;
    const lastBar = bars[bars.length - 1];
    if (!lastBar) return;
    const indexOf = new Map(points.map((p, i) => [p.time, i]));
    const redraw = () => {
      const left = chart.priceScale('left').width();
      const width = host.clientWidth - left - chart.priceScale('right').width();
      const panes = chart.panes();
      const top = panes[0]?.getHeight() ?? 0;
      const subHeight = panes.slice(1).reduce((sum, pane) => sum + pane.getHeight(), 0);
      const waveTop = top + (panes[1]?.getHeight() ?? 0);
      if (width <= 0 || top <= 0) return;
      const groups = layoutDrawings({
        candidate: hit.candidate,
        form: hit.form,
        width,
        lastBar: { time: lastBar.time, close: lastBar.close },
        x: (time) => {
          const i = indexOf.get(time);
          return i === undefined ? null : chart.timeScale().logicalToCoordinate(i as never);
        },
        y: (price) => candles.priceToCoordinate(price),
        yRsi: (value) => {
          const y = rsi?.priceToCoordinate(value) ?? null;
          return y === null ? null : top + y;
        },
        yWave: (value) => {
          const y = wave?.priceToCoordinate(value) ?? null;
          return y === null ? null : waveTop + y;
        },
        text: (key, params) => t(key as never, { tf: hit.tf, up: UPPER_TIMEFRAME[hit.tf], ...params }),
        fmt: (n) => number(n, { maximumFractionDigits: 3 }),
      });
      onPriceBottom(top);
      // Ende der letzten Kerze: halbe Kerzenbreite hinter ihrer Mitte (der logische Index zählt Kerzen und Leerstellen)
      const lastX = chart.timeScale().logicalToCoordinate((points.length - 1) as never);
      const asOfX = lastX === null ? null : lastX + chart.timeScale().options().barSpacing / 2;
      setOverlay({ width, left, height: top + subHeight, priceHeight: top, waveTop, groups, asOfX });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    chart.timeScale().subscribeSizeChange(redraw);
    redrawRef.current = redraw;
    const observer = new ResizeObserver(redraw);
    observer.observe(host);
    // Alle Bereiche: ein Zug am Trenner ändert nur ihre Höhen, nicht Host und Kerzen-Bereich
    chart.panes().forEach((pane) => { const el = pane.getHTMLElement(); if (el) observer.observe(el); });
    let redrawFrame = 0;
    const frame = requestAnimationFrame(() => { redrawFrame = requestAnimationFrame(redraw); });
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      redrawRef.current = null;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(redrawFrame);
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      chart.timeScale().unsubscribeSizeChange(redraw);
    };
    // ChartCore baut den Chart beim Unmount vor diesem Effekt ab
    const unregister = binding.onDispose(dispose);
    return () => { unregister(); dispose(); };
  }, [binding, rsi, wave, bars, points, hit, t, number, onPriceBottom]);

  // Die Preisachse kann sich mit der laufenden Kerze oder den Einstellungen ändern: Zeichnungen folgen im nächsten Frame
  useEffect(() => {
    const frame = requestAnimationFrame(() => redrawRef.current?.());
    return () => cancelAnimationFrame(frame);
  }, [running, appearance]);

  const activeSet = active ? new Set(active) : null;
  return (
    <>
    {asOf && overlay.asOfX !== null && overlay.asOfX >= 0 && (
      <svg className="absolute left-0 top-0 z-10 overflow-hidden" width={overlay.width} height={overlay.height} style={{ pointerEvents: 'none', left: overlay.left }} aria-hidden="true" data-testid="formation-asof-line" data-x={Math.round(overlay.asOfX)}>
        <line x1={overlay.asOfX} x2={overlay.asOfX} y1={0} y2={overlay.height} stroke="var(--warning)" strokeWidth={1.5} strokeDasharray="5 4" />
        <text x={overlay.asOfX + 4} y={overlay.priceHeight - 8} fill="var(--warning)" fontSize={10} fontFamily="monospace">{t('formation.asof.line')}</text>
      </svg>
    )}
    <svg
      ref={overlayRef}
      data-testid="formation-overlay"
      className="absolute left-0 top-0 z-10 overflow-hidden"
      width={overlay.width}
      height={overlay.height}
      style={{ pointerEvents: 'none', left: overlay.left, display: visible ? undefined : 'none' }}
      aria-hidden="true"
    >
      <defs>
        {/* Zeichnungen im Kerzen-Pane enden an dessen Rand: ein Preis außerhalb der Ansicht läuft nicht in den RSI-Pane */}
        <clipPath id="formation-price-clip">
          <rect x={0} y={0} width={overlay.width} height={overlay.priceHeight} />
        </clipPath>
      </defs>
      {waveVisible && overlay.waveTop > 0 && (
        <text x={8} y={overlay.waveTop + 16} fill="var(--muted-foreground)" fontSize={11}>{t('formation.pane.wave')}</text>
      )}
      {overlay.groups.filter((g) => g.pane !== 'rsi' || rsiVisible).map((g) => (
        <g
          key={g.id}
          clipPath={g.pane === 'price' ? 'url(#formation-price-clip)' : undefined}
          data-drawing={g.id}
          data-active={activeSet?.has(g.id) ? 'true' : 'false'}
          opacity={activeSet && !activeSet.has(g.id) ? 0.2 : 1}
          style={{ transition: 'opacity .15s' }}
          onMouseEnter={() => onActive([g.id])}
          onMouseLeave={() => onActive(null)}
        >
          {g.prims.map((p, i) => (
            <PrimView key={i} prim={p} side={hit.candidate.side} />
          ))}
        </g>
      ))}
    </svg>
    </>
  );
}

/** Kerzen und RSI(7) des gewählten Kandidaten mit den Zeichnungen der Erkennung. */
export function FormationChart({ accountId, hit, context, scanAt, running, asOf, digits, active, onActive, onCapture, onPriceBottom }: Props) {
  const t = useT();
  const source = useConnectionStore(s => s.baseUrl);
  const contextKey = workspaceKey({ source, view: 'formation', account: accountId, symbol: context.symbol });
  const overlays = useChartOverlays(contextKey, { formations: true, rsi: true, wave: true });
  const view = useMemo(() => context.view(hit.tf, scanAt), [context, hit.tf, scanAt]);
  const bars = view?.bars ?? NO_BARS;
  // Pausen und Datenlücken wie auf /chart (formationChartData)
  const data = useMemo(() => formationChartData(view, TIMEFRAME_SEC[hit.tf]), [view, hit.tf]);
  // Trendzug wie auf /chart (ANA-21), aber aus den Kerzen der Formation: nur geschlossene bis scanAt, ohne laufende Kerze
  const showTrend = useAnalysisPrefsStore(s => s.showTrend);
  const trendSettings = useAnalysisPrefsStore(s => s.trend);
  const trendPath = useMemo(
    () => (showTrend && bars.length > 0 ? { segments: buildTrendPath(hit.tf, bars, usableTrendSettings(trendSettings)), axis: bars.map(b => b.time) } : NO_TREND),
    [showTrend, bars, hit.tf, trendSettings],
  );
  const priceRange = useMemo(() => drawingPriceRange(hit.candidate), [hit.candidate]);
  const finalName = FINAL_POINT[hit.form];
  return (
    <ChartView
      key={contextKey}
      workspace={{ key: contextKey, symbol: context.symbol, view: 'formation', systemRsi: true, systemWave: true, syncIdentity: { source, account: accountId, symbol: context.symbol } }}
      signalBars={bars}
      timeframe={hit.tf}
      modeTitle={t('cw.layers.formation')}
      modeLayers={<ContextOverlays contextKey={contextKey} values={overlays} options={[{ key: 'formations', label: 'cw.overlayFormations', hint: 'cw.overlayFormations.hint' }]} />}
      data={data}
      timeframeSec={TIMEFRAME_SEC[hit.tf]}
      digits={digits}
      viewKey={`${contextKey}|${hit.tf}`}
      band={null}
      lines={NO_LINES}
      showRsi
      live={null}
      until={scanAt}
      runningBar={running}
      priceRange={priceRange}
      trendPath={trendPath}
      toolbarActions={<TrendToggle timeframe={hit.tf} size="xs" />}
      surfaceProps={{ 'data-testid': 'formation-chart', 'data-final-point': hit.candidate.points[finalName] ? 'done' : 'open' }}
      renderOverlay={(scene) => <FormationOverlay scene={scene} hit={hit} bars={bars} points={data.points} running={running} asOf={asOf} active={active} onActive={onActive} onCapture={onCapture} onPriceBottom={onPriceBottom} visible={overlays.formations} rsiVisible={overlays.rsi} waveVisible={overlays.wave} />}
    />
  );
}
