'use client';

import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';
import type { ChartTimeframe } from '@/lib/analysis/candles';
import { contextTimeframe } from '@/hooks/useTrendPath';
import { cn } from '@/lib/utils';
import { trendFingerprint } from '@/lib/formation/trdPath';
import { useTrendConfirm } from '@/hooks/useTrendConfirm';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { TrendSettingsPanel } from './TrendSettingsPanel';

/**
 * `Trend`-Button und Zahnrad in der Kopfleiste des Charts (ANA-21): Trendzug an/aus und seine Einstellungen.
 * `size="xs"` im Modus Formation von /chart, wo alle Chart-Werkzeuge so groß sind wie die Zeitrahmen-Knöpfe der Kopfleiste.
 */
export function TrendToggle({ timeframe, size = 'sm' }: { timeframe: ChartTimeframe; size?: 'sm' | 'xs' }) {
  const t = useT();
  const on = useAnalysisPrefsStore((s) => s.showTrend);
  const setShowTrend = useAnalysisPrefsStore((s) => s.setShowTrend);
  // Entwurf ≠ angewendet: Punkt am Knopf, bis der Nutzer im Panel bestätigt oder zurücknimmt (FRM-42)
  // Nur im Modus Formation gibt es eine Bestätigungsleiste: dort ist der Punkt sichtbar (R1-03)
  const confirm = useTrendConfirm();
  const pending = useAnalysisPrefsStore((s) => confirm && trendFingerprint(s.trendDraft) !== trendFingerprint(s.trend));
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
        {pending && <span aria-hidden className="ml-1 size-1.5 rounded-full bg-primary" data-testid="trend-pending-dot" />}
      </Button>
      <DropdownMenu
        label={t('cw.trend.settings')}
        hint={t('cw.trend.settings.hint')}
        icon={<SlidersHorizontal size={15} />}
        variant="ghost"
        size={size === 'xs' ? 'icon-xs' : 'icon-sm'}
        // Auf /chart (Formation) schwebt die Werkzeugleiste unter der Schwelle von FormationToolbar.tsx unten: dort geht das Panel nach oben auf.
        // Höhe dann höchstens Viewport − 24rem, mindestens 12rem (bei 812×375 wurde sie sonst 0 und das Menü unbenutzbar), damit die Oberkante unter der Kopfleiste bleibt.
        panelClassName="w-[372px] max-w-[calc(100vw-16px)] max-h-[70dvh] overflow-y-auto group-data-[menu=up]/tb:top-auto group-data-[menu=up]/tb:bottom-full group-data-[menu=up]/tb:mt-0 group-data-[menu=up]/tb:mb-2 group-data-[menu=up]/tb:max-h-[min(70dvh,max(12rem,calc(100dvh-24rem)))]"
        triggerProps={{ 'data-testid': 'trend-settings' }}
      >
        <TrendSettingsPanel />
      </DropdownMenu>
    </>
  );
}
