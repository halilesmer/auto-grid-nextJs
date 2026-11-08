'use client';

import type { ReactNode } from 'react';

import { FloatingCard } from '@/components/chart-page/FloatingCard';
import { useT } from '@/i18n';
import { CARD_TABS, type CardTab } from '@/hooks/useFormationSidebar';

/**
 * Die eine Karte des Charts (1107-A21.4): Seitenleiste und Setup-Karte in einem. Reiter Bedingungen, Favoriten, Genel bakış, İşlemler.
 * Auf/Zu und Reiter kommen von `useFormationSidebar` (Speicher `grid-robot-formation-sidebar`); ab lg ist die Karte beim ersten Besuch offen, darunter zu (UI-10).
 */
export function ChartCard({ title, open, onOpenChange, tab, onTab, conditions, favorites, overview, trades }: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: CardTab;
  onTab: (tab: CardTab) => void;
  /** Reiter Bedingungen: Checkliste, oder ein Hinweis ohne Treffer und auf einer Zeiteinheit ohne Formationen */
  conditions: ReactNode;
  /** Reiter Favoriten: Liste mit Hinzufügen-Knopf */
  favorites: ReactNode;
  overview: ReactNode;
  trades: ReactNode;
}) {
  const t = useT();
  return (
    <FloatingCard
      title={title}
      open={open}
      onOpenChange={onOpenChange}
      tab={tab}
      onTabChange={(id) => onTab(CARD_TABS.find((x) => x === id) ?? 'conditions')}
      tabs={[
        { id: 'conditions', label: t('chart.card.conditions'), hint: t('chart.card.conditions.hint'), content: <div className="-m-3 flex max-h-[min(50dvh,30rem)] min-h-0 flex-col">{conditions}</div> },
        { id: 'favorites', label: t('chart.card.favorites'), hint: t('chart.card.favorites.hint'), content: <div className="-m-3 flex max-h-[min(50dvh,30rem)] min-h-0 flex-col">{favorites}</div> },
        { id: 'overview', label: t('chart.card.overview'), hint: t('chart.card.overview.hint'), content: overview },
        { id: 'trades', label: t('chart.card.trades'), hint: t('chart.card.trades.hint'), wide: true, content: trades },
      ]}
    />
  );
}
