'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bar } from '@/lib/analysis/candles';
import { useFormat, useT } from '@/i18n';
import type { FormationContext } from '@/lib/formation/context';
import { drawingPriceRange, layoutDrawings, type DrawingGroup, type Prim, type Tone } from '@/lib/formation/drawingLayout';
import { RSI_PARAMS } from '@/lib/formation/params';
import { FINAL_POINT, UPPER_TIMEFRAME, type ScanHit } from '@/lib/formation/scan';
import { captureChart, type ChartPicture } from '@/lib/formation/shotImage';
import { ChartCore, type ChartScene, type OverlayLine } from '@/components/analysis/chart/ChartCore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { ContextOverlays, useChartOverlays } from '@/components/chart-workspace/ContextOverlays';
import { workspaceKey } from '@/lib/chart-workspace/settings';

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
  digits: number | null;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
  /** Meldet die Aufnahme des gezeigten Charts (Kerzen samt Zeichnungen) oder null, wenn der Chart abgebaut wird */
  onCapture: (capture: (() => Promise<ChartPicture>) | null) => void;
}

const NO_LINES: OverlayLine[] = [];
const NO_BARS: Bar[] = [];
const NO_MISSING: never[] = [];
const RSI_LEVELS = [RSI_PARAMS.overbought, RSI_PARAMS.oversold];
/** Die Bedienung liegt oben auf dem Chart: die Kerzen beginnen darunter */
const controlMargins = (width: number) => ({ top: width < 640 ? 0.4 : 0.3, bottom: 0.12 });

/** Zeichnungen der Erkennung als SVG über dem Chart; das Overlay endet vor der Preisachse. */
function FormationOverlay({ scene, hit, bars, running, active, onActive, onCapture, visible }: Pick<Props, 'hit' | 'running' | 'active' | 'onActive' | 'onCapture'> & { scene: ChartScene; bars: readonly Bar[]; visible: boolean }) {
  const t = useT();
  const { number } = useFormat();
  const { binding, rsi } = scene;
  const overlayRef = useRef<SVGSVGElement>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number; left: number; priceHeight: number; groups: DrawingGroup[] }>({ width: 0, height: 0, left: 0, priceHeight: 0, groups: [] });

  useEffect(() => {
    const { chart, host } = binding;
    onCapture(() => captureChart({ chart, host, overlay: overlayRef.current }));
    return () => onCapture(null);
  }, [binding, onCapture]);

  useEffect(() => {
    const { chart, candles, host } = binding;
    const lastBar = bars[bars.length - 1];
    if (!lastBar) return;
    const indexOf = new Map(bars.map((b, i) => [b.time, i]));
    const redraw = () => {
      const left = chart.priceScale('left').width();
      const width = host.clientWidth - left - chart.priceScale('right').width();
      const panes = chart.panes();
      const top = panes[0]?.getHeight() ?? 0;
      const rsiHeight = panes[1]?.getHeight() ?? 0;
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
        text: (key, params) => t(key as never, { tf: hit.tf, up: UPPER_TIMEFRAME[hit.tf], ...params }),
        fmt: (n) => number(n, { maximumFractionDigits: 3 }),
      });
      setOverlay({ width, left, height: top + rsiHeight, priceHeight: top, groups });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);
    chart.timeScale().subscribeSizeChange(redraw);
    redrawRef.current = redraw;
    const observer = new ResizeObserver(redraw);
    observer.observe(host);
    const pricePane = chart.panes()[0]?.getHTMLElement();
    if (pricePane) observer.observe(pricePane);
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
  }, [binding, rsi, bars, hit, t, number]);

  // Die Preisachse kann sich mit der laufenden Kerze ändern: Zeichnungen folgen im nächsten Frame
  useEffect(() => {
    const frame = requestAnimationFrame(() => redrawRef.current?.());
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const activeSet = active ? new Set(active) : null;
  return (
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
      {overlay.groups.map((g) => (
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
  );
}

/** Kerzen und RSI(7) des gewählten Kandidaten mit den Zeichnungen der Erkennung. */
export function FormationChart({ accountId, hit, context, scanAt, running, digits, active, onActive, onCapture }: Props) {
  const source = useConnectionStore(s => s.baseUrl);
  const contextKey = workspaceKey({ source, view: 'formation', account: accountId, symbol: context.symbol });
  const overlays = useChartOverlays(contextKey, { formations: true, rsi: true });
  const view = useMemo(() => context.view(hit.tf, scanAt), [context, hit.tf, scanAt]);
  const bars = view?.bars ?? NO_BARS;
  const data = useMemo(() => ({ points: bars, bars, missing: NO_MISSING, pauses: NO_MISSING }), [bars]);
  const rsiPoints = useMemo(() => bars.flatMap((b, i) => {
    const value = view?.rsi[i];
    return value == null ? [] : [{ time: b.time, value }];
  }), [bars, view]);
  const priceRange = useMemo(() => drawingPriceRange(hit.candidate), [hit.candidate]);
  const finalName = FINAL_POINT[hit.form];
  return (
    <ChartCore
      key={contextKey}
      workspace={{ key: contextKey, symbol: context.symbol, view: 'formation', systemRsi: true, syncIdentity: { source, account: accountId, symbol: context.symbol } }}
      workspaceOverlays={<ContextOverlays contextKey={contextKey} values={overlays} options={[
        { key: 'formations', label: 'cw.overlayFormations', hint: 'cw.overlayFormations.hint' },
        { key: 'rsi', label: 'formation.legend.rsi', hint: 'cw.systemRsi.hint' },
      ]} />}
      data={data}
      timeframeSec={({ D1: 86400, H4: 14400, H1: 3600, M15: 900 }[hit.tf])}
      digits={digits}
      viewKey={`${contextKey}|${hit.tf}`}
      band={null}
      lines={NO_LINES}
      showPauses={false}
      showGaps={false}
      showRsi
      live={null}
      until={scanAt}
      systemRsi={{ points: rsiPoints, levels: RSI_LEVELS, visible: overlays.rsi }}
      runningBar={running}
      priceRange={priceRange}
      marginsFor={controlMargins}
      overlayLayout
      surfaceProps={{ 'data-testid': 'formation-chart', 'data-final-point': hit.candidate.points[finalName] ? 'done' : 'open' }}
      renderOverlay={(scene) => <FormationOverlay scene={scene} hit={hit} bars={bars} running={running} active={active} onActive={onActive} onCapture={onCapture} visible={overlays.formations} />}
    />
  );
}
