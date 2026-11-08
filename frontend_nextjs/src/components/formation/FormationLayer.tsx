'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { TIMEFRAME_SEC, type Bar } from '@/lib/analysis/candles';
import { useFormat, useT } from '@/i18n';
import { Tooltip } from '@/components/ui/tooltip';
import { layoutDrawings, layoutExpectedD, type DLayout, type DrawingGroup, type Prim, type Tone } from '@/lib/formation/drawingLayout';
import { UPPER_TIMEFRAME, type ScanHit } from '@/lib/formation/scan';
import { captureChart, type ChartPicture } from '@/lib/formation/shotImage';
import type { ChartScene } from '@/components/analysis/chart/ChartCore';
import { useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';
import { PANES_CHANGED_EVENT } from '@/components/chart-workspace/runtime';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { dashOf, type FormationLineRole, type FormationStyle } from '@/lib/formation/lineStyle';
import { lineMenuAllows } from '@/lib/chart-workspace/lineMenu';
import { FormationLineMenu } from './FormationLineMenu';

/** Öffnet das Linienmenü einer Rolle (Rechtsklick/Doppelklick); die Seite entscheidet, ob der Klick zählt */
type OpenLineMenu = (kind: 'context' | 'double', event: React.MouseEvent, role: FormationLineRole) => void;

const TONE_COLOR: Record<Exclude<Tone, 'side'>, string> = {
  ratio: 'var(--secondary)',
  target: 'var(--warning)',
  zone: 'var(--info)',
  mark: 'var(--primary)',
  text: 'var(--foreground)',
};

/** The drawing of a formation lies over the whole chart (the one chart, 1107-A21): its hit areas must not swallow the wheel, so it goes on to the chart below (zoom) */
function forwardWheel(e: React.WheelEvent) {
  const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest('[data-testid="formation-overlay"]'));
  under?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey }));
}

const SIDE_COLOR = { buy: 'var(--success)', sell: 'var(--danger)' } as const;

const toneColor = (tone: Tone, side: 'buy' | 'sell'): string => (tone === 'side' ? SIDE_COLOR[side] : TONE_COLOR[tone]);

function PrimView({ prim, side, style, onMenu }: { prim: Prim; side: 'buy' | 'sell'; style: FormationStyle; onMenu: OpenLineMenu }) {
  const color = toneColor(prim.tone, side);
  switch (prim.kind) {
    case 'line': {
      // Farbe, Muster und Dicke kommen aus dem Stil der Rolle (leere Farbe: Themefarbe); eine ausgeblendete Rolle fällt weg
      const spec = style[prim.role];
      if (!spec.visible) return null;
      return (
        <>
          <line
            x1={prim.x1}
            y1={prim.y1}
            x2={prim.x2}
            y2={prim.y2}
            stroke={spec.color || color}
            strokeWidth={spec.width}
            strokeDasharray={dashOf(spec.style)}
            data-role={prim.role}
            data-expected-path={prim.role === 'expected' ? '' : undefined}
          />
          <line
            x1={prim.x1}
            y1={prim.y1}
            x2={prim.x2}
            y2={prim.y2}
            stroke="transparent"
            strokeWidth={14}
            style={{ pointerEvents: 'stroke' }}
            data-testid="line-hit"
            data-hit-role={prim.role}
            onContextMenu={e => onMenu('context', e, prim.role)}
            onDoubleClick={e => onMenu('double', e, prim.role)}
          />
        </>
      );
    }
    case 'rect': {
      const spec = prim.role ? style[prim.role] : null;
      if (spec && !spec.visible) return null;
      const stroke = spec?.color || color;
      const small = prim.w <= 20;
      let strokeWidth = small ? 2 : 1;
      let dash = prim.dashed ? '4 3' : undefined;
      if (spec) {
        strokeWidth = spec.width;
        dash = dashOf(spec.style);
      }
      return (
        <rect
          x={prim.x}
          y={prim.y}
          width={prim.w}
          height={prim.h}
          fill={prim.tone === 'zone' || prim.tone === 'mark' ? stroke : 'none'}
          fillOpacity={prim.tone === 'mark' && prim.w <= 20 ? 0 : 0.16}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dash}
          rx={prim.w <= 20 ? 3 : 0}
        />
      );
    }
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

/** Eingabe der Formationsschicht: der Treffer, die Kerzen und Punkte des Charts und die Szene von `ChartView.renderOverlay` */
export interface FormationLayerProps {
  hit: ScanHit;
  scene: ChartScene;
  /** Geschlossene Kerzen des Charts; die Zeichnung endet an der letzten. Die Reihe darf viel länger sein als die Spanne des Treffers */
  bars: readonly Bar[];
  /** Zeiten der Chart-Punkte: Kerzen plus Leerstellen der Datenlücken (der logische Index zählt beide). Ein Punkt des Treffers vor der Reihe oder in einer Lücke hat keine Position: die Zeichnung bleibt lückenhaft, kein Fehler. Zeiten hinter dem letzten Punkt liegen in Kerzenabständen rechts davon */
  points: readonly { time: number }[];
  /** ATR der letzten Kerze (Band „D? bölgesi“) */
  atr: number | null;
  /** Laufende Kerze mit dem aktuellen Preis, nur zur Anzeige */
  running: Bar | null;
  /** Stand in der Vergangenheit (FRM-38): gestrichelte Linie „Stand“ am Ende der Kerzen */
  asOf?: boolean;
  /** Hervorgehobene Zeichnungen (Hover auf Zeile oder Zeichnung); null: alle gleich */
  active: readonly string[] | null;
  onActive: (ids: string[] | null) => void;
  /** Meldet die Aufnahme des gezeigten Charts (Kerzen samt Zeichnungen) oder null, wenn der Chart abgebaut wird */
  onCapture: (capture: (() => Promise<ChartPicture>) | null) => void;
  /** Unterkante des Kerzen-Bereichs in px ab Oberkante des Charts; die Legende bleibt darüber */
  onPriceBottom: (px: number) => void;
  /** Alle Treffer des Zeitrahmens: ihr erwartetes D erscheint als Abzeichen (A5.6.1); der gewählte Treffer wird voll gezeichnet */
  others?: readonly ScanHit[];
  /** Klick auf ein Abzeichen wählt die Formation */
  onSelectHit?: (hit: ScanHit) => void;
  visible: boolean;
  rsiVisible: boolean;
  waveVisible: boolean;
  /** Key of the chart document (one chart): its own look (e.g. the line menu setting) wins over the global one */
  workspaceKey?: string;
}

const NO_D: DLayout = { badges: [], rings: [], bands: [] };
const NO_HITS: readonly ScanHit[] = [];

/** Zeichnungen der Erkennung als SVG über dem Chart (für `renderOverlay` jedes `ChartView`); das Overlay endet vor der Preisachse. */
export function FormationLayer({ scene, hit, bars, points, running, asOf, active, onActive, onCapture, onPriceBottom, visible, rsiVisible, waveVisible, others = NO_HITS, onSelectHit, atr, workspaceKey }: FormationLayerProps) {
  const t = useT();
  const { number } = useFormat();
  const { binding, rsi, wave } = scene;
  const appearance = useChartWorkspaceStore(s => s.preview ?? (workspaceKey ? s.documents[workspaceKey]?.appearance : undefined) ?? s.appearance);
  const formationStyle = useAnalysisPrefsStore(s => s.formationStyle);
  const lineMenuMode = appearance.lineMenu;
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; role: FormationLineRole } | null>(null);
  const closeLineMenu = useCallback(() => setLineMenu(null), []);
  // Einstellung „Çizgi menüsü“ (A7.7): Langdruck auf Android kommt als contextmenu und zählt als Rechtsklick; sonst bleibt das Browsermenü
  const openLineMenu = useCallback<OpenLineMenu>((kind, event, role) => {
    if (!lineMenuAllows(lineMenuMode, kind)) return;
    event.preventDefault();
    setLineMenu({ x: event.clientX, y: event.clientY, role });
  }, [lineMenuMode]);
  const clipId = `formation-price-clip-${useId().replace(/:/g, '')}`;
  const overlayRef = useRef<SVGSVGElement>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number; left: number; priceHeight: number; waveTop: number; groups: DrawingGroup[]; asOfX: number | null; d: DLayout }>({ width: 0, height: 0, left: 0, priceHeight: 0, waveTop: 0, groups: [], asOfX: null, d: NO_D });

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
      // The system panes come and go (layers, eye) and move (order), so their position is read from the pane of their series now
      const hostTop = host.getBoundingClientRect().top;
      const paneTop = (series: { getPane: () => { getHTMLElement: () => HTMLElement | null } } | null) => {
        const element = series?.getPane().getHTMLElement();
        return element ? element.getBoundingClientRect().top - hostTop : null;
      };
      const rsiSeries = rsi.current, waveSeries = wave.current, rsiTop = paneTop(rsiSeries), waveTop = paneTop(waveSeries) ?? 0;
      if (width <= 0 || top <= 0) return;
      // Zeiten hinter der letzten Kerze (erwartetes D) liegen in Kerzenabständen rechts davon
      const lastPoint = points[points.length - 1];
      const x = (time: number) => {
        const i = indexOf.get(time);
        if (i !== undefined) return chart.timeScale().logicalToCoordinate(i as never);
        if (lastPoint && time > lastPoint.time) return chart.timeScale().logicalToCoordinate((points.length - 1 + (time - lastPoint.time) / TIMEFRAME_SEC[hit.tf]) as never);
        return null;
      };
      const y = (price: number) => candles.priceToCoordinate(price);
      const label = (key: string, params?: Record<string, string | number>) => t(key as never, { tf: hit.tf, up: UPPER_TIMEFRAME[hit.tf], ...params });
      const fmtN = (n: number) => number(n, { maximumFractionDigits: 5 });
      const selectedId = `${hit.form}-${hit.tf}`;
      const d = layoutExpectedD({
        items: [{ id: selectedId, form: hit.form, candidate: hit.candidate }, ...others.filter((o) => o.tf === hit.tf && o.candidate !== hit.candidate).map((o) => ({ id: `${o.form}-${o.tf}`, form: o.form, candidate: o.candidate }))],
        selectedId,
        width,
        height: top,
        lastTime: lastBar.time,
        barSec: TIMEFRAME_SEC[hit.tf],
        close: lastBar.close,
        atr,
        x,
        y,
        text: label,
        fmt: fmtN,
      });
      const groups = layoutDrawings({
        candidate: hit.candidate,
        form: hit.form,
        width,
        lastBar: { time: lastBar.time, close: lastBar.close },
        barSec: TIMEFRAME_SEC[hit.tf],
        stack: d.badges.length > 1 ? { left: Math.min(...d.badges.map((b) => b.bx)), top: Math.min(...d.badges.map((b) => b.by)), bottom: Math.max(...d.badges.map((b) => b.by + b.h)) } : null,
        x,
        y,
        yRsi: (value) => {
          const y = rsiSeries?.priceToCoordinate(value) ?? null;
          return y === null || rsiTop === null ? null : rsiTop + y;
        },
        yWave: (value) => {
          const y = waveSeries?.priceToCoordinate(value) ?? null;
          return y === null || waveSeries === null ? null : waveTop + y;
        },
        text: (key, params) => t(key as never, { tf: hit.tf, up: UPPER_TIMEFRAME[hit.tf], ...params }),
        fmt: (n) => number(n, { maximumFractionDigits: 3 }),
      });
      onPriceBottom(top);
      // Ende der letzten Kerze: halbe Kerzenbreite hinter ihrer Mitte (der logische Index zählt Kerzen und Leerstellen)
      const lastX = chart.timeScale().logicalToCoordinate((points.length - 1) as never);
      const asOfX = lastX === null ? null : lastX + chart.timeScale().options().barSpacing / 2;
      setOverlay({ width, left, height: top + subHeight, priceHeight: top, waveTop, groups, asOfX, d });
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
    // Panes were built, removed or reordered: observe the new ones, measure after the chart laid them out
    let panesFrame = 0;
    const panesChanged = () => {
      chart.panes().forEach((pane) => { const el = pane.getHTMLElement(); if (el) observer.observe(el); });
      cancelAnimationFrame(panesFrame);
      panesFrame = requestAnimationFrame(() => { panesFrame = requestAnimationFrame(redraw); });
    };
    host.addEventListener(PANES_CHANGED_EVENT, panesChanged);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      redrawRef.current = null;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(redrawFrame);
      cancelAnimationFrame(panesFrame);
      host.removeEventListener(PANES_CHANGED_EVENT, panesChanged);
      observer.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);
      chart.timeScale().unsubscribeSizeChange(redraw);
    };
    // ChartCore baut den Chart beim Unmount vor diesem Effekt ab
    const unregister = binding.onDispose(dispose);
    return () => { unregister(); dispose(); };
  }, [binding, rsi, wave, bars, points, hit, others, atr, t, number, onPriceBottom]);

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
        <clipPath id={clipId}>
          <rect x={0} y={0} width={overlay.width} height={overlay.priceHeight} />
        </clipPath>
      </defs>
      {waveVisible && overlay.waveTop > 0 && (
        <text x={8} y={overlay.waveTop + 16} fill="var(--muted-foreground)" fontSize={11}>{t('formation.pane.wave')}</text>
      )}
      {overlay.groups.filter((g) => g.pane !== 'rsi' || rsiVisible).map((g) => (
        <g
          key={g.id}
          clipPath={g.pane === 'price' ? `url(#${clipId})` : undefined}
          data-drawing={g.id}
          data-active={activeSet?.has(g.id) ? 'true' : 'false'}
          opacity={activeSet && !activeSet.has(g.id) ? 0.2 : 1}
          style={{ transition: 'opacity .15s' }}
          onMouseEnter={() => onActive([g.id])}
          onMouseLeave={() => onActive(null)}
          onWheel={forwardWheel}
        >
          {g.prims.map((p, i) => (
            <PrimView key={i} prim={p} side={hit.candidate.side} style={formationStyle} onMenu={openLineMenu} />
          ))}
        </g>
      ))}
    </svg>
    <svg
      data-testid="formation-d-badges"
      className="absolute left-0 top-0 z-10 overflow-hidden"
      width={overlay.width}
      height={overlay.priceHeight}
      style={{ pointerEvents: 'none', left: overlay.left, display: visible ? undefined : 'none' }}
    >
      {overlay.d.bands.map((b, i) => (
        <g key={`band-${i}`} data-testid="formation-d-band">
          <rect x={b.x} y={b.top} width={Math.max(0, overlay.width - b.x)} height={Math.max(2, b.bottom - b.top)} fill="var(--info)" fillOpacity={0.14} stroke="var(--info)" strokeDasharray="6 5" />
          <text x={b.x + 6} y={b.top - 4} fill="var(--info)" fontSize={11} stroke="var(--card)" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">{b.label}</text>
        </g>
      ))}
      {overlay.d.rings.map((r) => (
        <circle key={`ring-${r.id}`} data-testid="formation-d-ring" cx={r.x} cy={r.y} r={5} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} opacity={0.55} />
      ))}
      {overlay.d.badges.map((b) => {
        const color = b.status === 'valid' ? 'var(--success)' : 'var(--warning)';
        const pick = () => { const h = [hit, ...others].find((o) => `${o.form}-${o.tf}` === b.id); if (h && !b.selected) onSelectHit?.(h); };
        return (
          <g
            key={b.id}
            data-testid="formation-d-badge"
            data-id={b.id}
            data-status={b.status}
            data-selected={b.selected ? 'true' : 'false'}
            role="button"
            tabIndex={0}
            data-tooltip-scope
            aria-label={t('formation.expectedD.select', { name: b.label })}
            aria-pressed={b.selected}
            opacity={b.selected ? 1 : 0.55}
            style={{ pointerEvents: 'all', cursor: b.selected ? 'default' : 'pointer' }}
            onClick={pick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
          >
            <rect x={b.bx} y={b.by} width={b.w} height={b.h} rx={4} fill="var(--card)" stroke={color} strokeWidth={b.selected ? 2 : 1.2} />
            <text x={b.bx + 8} y={b.by + b.h / 2 + 4} fill="var(--foreground)" fontSize={11} fontWeight={600}>{b.label}</text>
            {/* Tooltip ist HTML: in SVG über ein foreignObject mit durchsichtiger Fläche auf dem Abzeichen */}
            <foreignObject x={b.bx} y={b.by} width={b.w} height={b.h}>
              <Tooltip content={t('formation.expectedD.select.hint')} side="bottom" className="block size-full"><span className="block size-full" /></Tooltip>
            </foreignObject>
          </g>
        );
      })}
    </svg>
    {lineMenu && <FormationLineMenu x={lineMenu.x} y={lineMenu.y} role={lineMenu.role} onClose={closeLineMenu} />}
    </>
  );
}
