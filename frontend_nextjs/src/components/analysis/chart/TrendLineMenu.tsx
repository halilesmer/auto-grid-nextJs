'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { IChartApi, MouseEventParams, Time } from 'lightweight-charts';
import { useDrawingPriority, useToolGrace } from '@/components/chart-workspace/drawingPriority';
import { LineStyleControls } from '@/components/chart-workspace/LineStyleControls';
import { TrendSettingsPanel } from '@/components/chart-workspace/TrendSettingsPanel';
import { ContextMenu, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/components/ui/context-menu';
import { Modal } from '@/components/ui/modal';
import { useT } from '@/i18n';
import type { Appearance } from '@/lib/chart-workspace/settings';
import { lineMenuAllows, type LineMenuTrigger } from '@/lib/chart-workspace/lineMenu';
import type { LineStyleSpec } from '@/lib/formation/lineStyle';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { TREND_PATH_ID } from './primitives';

/**
 * Menü der Trendlinie (Plan 1105-A7, S4): Farbe aufwärts und abwärts, Typ und Dicke (gelten für beide Richtungen),
 * Zurücksetzen, Trend-Einstellungen. Änderungen wirken sofort.
 */
function TrendLineMenu({ x, y, onClose, onSettings }: { x: number; y: number; onClose: () => void; onSettings: () => void }) {
  const t = useT();
  const up = useAnalysisPrefsStore(s => s.formationStyle.trendUp);
  const down = useAnalysisPrefsStore(s => s.formationStyle.trendDown);
  const set = useAnalysisPrefsStore(s => s.setFormationStyle);
  const reset = useAnalysisPrefsStore(s => s.resetFormationStyle);
  // Typ und Dicke teilen sich beide Richtungen (ein Zug, eine Linie); nur die Farbe ist je Richtung
  const patchUp = useCallback((p: Partial<LineStyleSpec>) => {
    set('trendUp', p);
    const shared: Partial<LineStyleSpec> = {};
    if (p.style !== undefined) shared.style = p.style;
    if (p.width !== undefined) shared.width = p.width;
    if (Object.keys(shared).length) set('trendDown', shared);
  }, [set]);
  const patchDown = useCallback((p: Partial<LineStyleSpec>) => set('trendDown', { color: p.color }), [set]);
  return (
    <ContextMenu x={x} y={y} label={t('trendLine.menu')} onClose={onClose} data-testid="trend-menu">
      <ContextMenuLabel>{t('trendLine.menu')}</ContextMenuLabel>
      <LineStyleControls spec={up} onChange={patchUp} auto="candle" colorLabel="trendLine.up" />
      <LineStyleControls spec={down} onChange={patchDown} auto="candle" colorLabel="trendLine.down" colorOnly />
      <ContextMenuSeparator />
      <ContextMenuItem hint={t('trendLine.reset.hint')} keepOpen onSelect={() => { reset('trendUp'); reset('trendDown'); }}>{t('trendLine.reset')}</ContextMenuItem>
      <ContextMenuItem hint={t('trendLine.settings.hint')} onSelect={onSettings}>{t('trendLine.settings')}</ContextMenuItem>
    </ContextMenu>
  );
}

interface HostProps {
  chart: IChartApi;
  /** Das Element, in dem der Chart liegt: dort kommt das `contextmenu`-Ereignis an */
  host: HTMLElement | null;
  /** Einstellung „Çizgi menüsü“ (A7.7) */
  lineMenu: Appearance['lineMenu'];
}

/**
 * Öffnet das Trendmenü, wenn der Zeiger auf der Trendlinie steht (`hoveredInfo.objectId` aus `TrendPathPrimitive.hitTest`)
 * und Rechtsklick oder Doppelklick die Einstellung „Çizgi menüsü“ erfüllen. Ein aktives Zeichenwerkzeug, eine Zeichnung unter
 * der Maus und jede andere Reihe unter dem Zeiger (Indikatorlinie) haben Vorrang: dann bleibt es beim Browsermenü.
 * `preventDefault` nur, wenn das Menü wirklich aufgeht.
 */
export function TrendLineMenuHost({ chart, host, lineMenu }: HostProps) {
  const t = useT();
  const priority = useDrawingPriority();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [settings, setSettings] = useState(false);
  const close = useCallback(() => setMenu(null), []);
  const mode = useRef(lineMenu);
  const overLine = useRef(false);
  const priorityRef = useRef(priority);
  const toolRecent = useToolGrace(host, () => priorityRef.current().toolActive);
  const toolRecentRef = useRef(toolRecent);
  // Die Handler unten lesen immer den neuesten Stand, ohne bei jeder Änderung neu abonniert zu werden
  useEffect(() => { mode.current = lineMenu; priorityRef.current = priority; toolRecentRef.current = toolRecent; }, [lineMenu, priority, toolRecent]);

  useEffect(() => {
    if (!host) return;
    const isTrend = (param: MouseEventParams<Time>) => param.hoveredInfo?.objectKind === 'primitive' && param.hoveredInfo.objectId === TREND_PATH_ID;
    const allowed = (trigger: LineMenuTrigger) => {
      const { toolActive, drawingHovered } = priorityRef.current();
      const toolRecent = toolRecentRef.current();
      return overLine.current && !toolActive && !toolRecent && !drawingHovered && lineMenuAllows(mode.current, trigger);
    };
    const onMove = (param: MouseEventParams<Time>) => { overLine.current = !!param.point && isTrend(param); };
    const onContext = (event: MouseEvent) => {
      if (!allowed('context')) return;
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY });
    };
    const onDouble = (param: MouseEventParams<Time>) => {
      overLine.current = !!param.point && isTrend(param);
      const source = param.sourceEvent;
      if (!source || !allowed('double')) return;
      setMenu({ x: source.clientX, y: source.clientY });
    };
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeDblClick(onDouble);
    host.addEventListener('contextmenu', onContext);
    return () => {
      overLine.current = false;
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeDblClick(onDouble);
      host.removeEventListener('contextmenu', onContext);
    };
  }, [chart, host]);

  return (
    <>
      {menu && <TrendLineMenu x={menu.x} y={menu.y} onClose={close} onSettings={() => setSettings(true)} />}
      <Modal open={settings} onClose={() => setSettings(false)} title={t('trendLine.settings.title')} className="max-h-[90dvh] max-w-[420px] overflow-y-auto p-2">
        <TrendSettingsPanel />
      </Modal>
    </>
  );
}
