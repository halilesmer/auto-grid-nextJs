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

/** `Trend`-Button und Zahnrad in der Kopfleiste des Charts (ANA-21): Trendzug an/aus und seine Einstellungen. */
export function TrendToggle({ timeframe }: { timeframe: Timeframe }) {
  const t = useT();
  const on = useAnalysisPrefsStore((s) => s.showTrend);
  const setShowTrend = useAnalysisPrefsStore((s) => s.setShowTrend);
  const available = contextTimeframe(timeframe) !== null;
  return (
    <>
      <Button
        size="sm"
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
        size="icon-sm"
        panelClassName="w-[372px] max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto"
        triggerProps={{ 'data-testid': 'trend-settings' }}
      >
        <TrendSettingsPanel />
      </DropdownMenu>
    </>
  );
}
