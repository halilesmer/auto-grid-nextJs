'use client';

import type { ReactNode } from 'react';
import { Layers } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useT } from '@/i18n';
import { contextTimeframe } from '@/hooks/useTrendPath';
import type { Timeframe } from '@/lib/analysis/candles';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { setSystemLayer } from '@/components/chart-workspace/systemLayers';

/**
 * Knopf „Ebenen“ neben Trend (UI-13): ein Menü, das auf jedem Chart gleich aufgebaut ist. Oben die gemeinsamen Ebenen
 * (Trendzug, System-RSI(7), Wave 5/35, Pausen, Datenlücken), darunter der Abschnitt des Modus (`modeTitle`, `children`).
 * Die Schalter schreiben in dieselben Speicher wie die alten Orte (`useAnalysisPrefsStore`, Overlays des Chart-Arbeitsbereichs),
 * gespeicherte Einstellungen gelten also weiter.
 */
export function LayersMenu({ contextKey, timeframe, rsi, wave, modeTitle, children }: {
  contextKey: string;
  timeframe: Timeframe;
  rsi: boolean;
  wave: boolean;
  modeTitle?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const showTrend = useAnalysisPrefsStore(s => s.showTrend), setShowTrend = useAnalysisPrefsStore(s => s.setShowTrend);
  const showPauses = useAnalysisPrefsStore(s => s.showPauses), showGaps = useAnalysisPrefsStore(s => s.showGaps), setPref = useAnalysisPrefsStore(s => s.setPref);
  const trendAvailable = contextTimeframe(timeframe) !== null;
  const setOverlay = (key: 'rsi' | 'wave', value: boolean) => setSystemLayer(contextKey, key, value);
  return (
    <DropdownMenu
      label={t('cw.layers')}
      hint={t('cw.layers.hint')}
      // Dar kapta (30rem altı, 375 px) ve başlıktaki üst şeritte (71rem ve üstü) yalnız simge; ad aria-label'da kalır (1105-A5.8, UI-16)
      icon={<span className="inline-flex items-center gap-1.5 text-xs"><Layers size={15} aria-hidden="true" /><span className="@max-[30rem]/formation-main:sr-only group-data-[zone=row1]/tb:sr-only">{t('cw.layers')}</span></span>}
      variant="ghost"
      size="xs"
      align="left"
      // Liegt die Gruppe unten (untere Leiste oder untere Hälfte des Charts, DockPackage data-menu=up), geht das Menü nach oben auf (UI-16)
      panelClassName="w-72 max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto group-data-[menu=up]/tb:top-auto group-data-[menu=up]/tb:bottom-full group-data-[menu=up]/tb:mt-0 group-data-[menu=up]/tb:mb-2 group-data-[menu=up]/tb:max-h-[min(70dvh,max(12rem,calc(100dvh-24rem)))]"
      triggerProps={{ 'data-testid': 'layers-button' }}
    >
      <div className="grid gap-1 p-3" data-testid="layers-menu">
        <p className="text-xs font-semibold text-foreground">{t('cw.layers')}</p>
        <p className="mb-1 text-[11px] text-muted-foreground">{t('cw.layers.shared')}</p>
        <div className="grid gap-2.5">
          <Switch id="layer-trend" label={t('cw.layerTrend')} hint={t(trendAvailable ? 'cw.layerTrend.hint' : 'cw.trend.unavailable.hint')} checked={showTrend && trendAvailable} disabled={!trendAvailable} onChange={setShowTrend} />
          <Switch id="layer-rsi" label={t('cw.layerRsi')} hint={t('cw.layerRsi.hint')} checked={rsi} onChange={v => setOverlay('rsi', v)} />
          <Switch id="layer-wave" label={t('cw.layerWave')} hint={t('cw.layerWave.hint')} checked={wave} onChange={v => setOverlay('wave', v)} />
          <Switch id="layer-pauses" label={t('analysis.settings.pauses')} hint={t('analysis.settings.pauses.hint')} checked={showPauses} onChange={v => setPref('showPauses', v)} />
          <Switch id="layer-gaps" label={t('analysis.settings.gaps')} hint={t('analysis.settings.gaps.hint')} checked={showGaps} onChange={v => setPref('showGaps', v)} />
        </div>
        {children && <>
          <div className="my-2 h-px bg-border" />
          <p className="mb-1 text-[11px] text-muted-foreground">{modeTitle}</p>
          <div className="grid gap-2.5">{children}</div>
        </>}
      </div>
    </DropdownMenu>
  );
}
