'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';
import type { Timeframe } from '@/lib/analysis/candles';
import { contextTimeframe } from '@/hooks/useTrendPath';
import { cn } from '@/lib/utils';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { TrendSettingsPanel } from './TrendSettingsPanel';

/**
 * `Trend`-Button und Zahnrad in der Kopfleiste des Charts (ANA-21): Trendzug an/aus und seine Einstellungen.
 * `size="xs"` auf /formasyon, wo alle Chart-Werkzeuge so groß sind wie die Zeitrahmen-Knöpfe der Kopfleiste.
 */
export function TrendToggle({ timeframe, size = 'sm' }: { timeframe: Timeframe; size?: 'sm' | 'xs' }) {
  const t = useT();
  const on = useAnalysisPrefsStore((s) => s.showTrend);
  const setShowTrend = useAnalysisPrefsStore((s) => s.setShowTrend);
  const available = contextTimeframe(timeframe) !== null;
  return (
    <>
      <Button
        size={size}
        variant="ghost"
        className={cn(on && available && 'bg-accent text-foreground')}
        hint={t(available ? 'cw.trend.hint' : 'cw.trend.unavailable.hint')}
        aria-pressed={on && available}
        disabled={!available}
        data-testid="trend-toggle"
        onClick={() => setShowTrend(!on)}
      >
        {t('cw.trend')}
      </Button>
      <DropdownMenu
        label={t('cw.trend.settings')}
        hint={t('cw.trend.settings.hint')}
        icon={<SlidersHorizontal size={15} />}
        variant="ghost"
        size={size === 'xs' ? 'icon-xs' : 'icon-sm'}
        // Auf /formasyon schwebt die Werkzeugleiste unter der Schwelle von FormationToolbar.tsx unten: dort geht das Panel nach oben auf.
        // Höhe dann höchstens Viewport − 24rem, damit die Oberkante unter der Kopfleiste bleibt (bei 375 px bis ca. 180 px hoch).
        panelClassName="w-[372px] max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto @max-[71rem]/formation-main:top-auto @max-[71rem]/formation-main:bottom-full @max-[71rem]/formation-main:mt-0 @max-[71rem]/formation-main:mb-2 @max-[71rem]/formation-main:max-h-[min(70dvh,calc(100dvh-24rem))]"
        triggerProps={{ 'data-testid': 'trend-settings' }}
      >
        <TrendSettingsPanel />
      </DropdownMenu>
    </>
  );
}
