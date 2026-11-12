'use client';

import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { Bookmark, LayoutList } from 'lucide-react';

import { CardTitle } from '@/components/chart-page/CardTitle';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { CARD_TABS, type CardTab } from '@/hooks/useFormationSidebar';
import { cn } from '@/lib/utils';

/** Reiter der Karte hinter dem Knopf „Karte“; Favoriten haben einen eigenen Knopf */
export const RAIL_CARD_TABS = CARD_TABS.filter((x): x is Exclude<CardTab, 'favorites'> => x !== 'favorites');

/**
 * Rechte Leiste und Seitenpanel der Chartseite ab lg (Halils Entwurf vom 2026-11-09, ersetzt die schwebende Karte, 1107-A21.22):
 * eine 40 px breite Leiste ganz rechts mit zwei Knöpfen („Karte“ und „Favoriten“), daneben das Panel (288 px), wenn es offen ist.
 * Das Panel schiebt den Chart zur Seite (`panelShown` in `ChartPage`: `right-10`, offen `lg:right-82`), es liegt nie über dem Chart
 * und nie über der Preisachse. Die Breiten w-10 und w-72 stehen in `ChartPage` als right-10 und lg:right-82.
 */
export function ChartSideRail({ title, form, open, tab, onToggle, onTab, conditions, favorites, favoritesAction, overview, trades }: {
  title: string;
  /** Name of the formation shown on the chart, beside the title (1112-A1) */
  form?: string;
  open: boolean;
  tab: CardTab;
  /** Klick auf einen Knopf der Leiste: gleicher Reiter und offen = zuklappen */
  onToggle: (group: 'card' | 'favorites') => void;
  onTab: (tab: CardTab) => void;
  conditions: ReactNode;
  favorites: ReactNode;
  /** Knopf „Hinzufügen“ rechts in der Kopfzeile des Favoriten-Panels */
  favoritesAction: ReactNode;
  overview: ReactNode;
  trades: ReactNode;
}) {
  const t = useT();
  const base = useId();
  const cardOpen = open && tab !== 'favorites';
  const favoritesOpen = open && tab === 'favorites';
  const railButton = (group: 'card' | 'favorites', on: boolean, label: string, hint: string, icon: ReactNode) => (
    <Tooltip content={hint} role="presentation">
      <button
        type="button"
        aria-pressed={on}
        aria-label={label}
        aria-expanded={on}
        data-testid={`chart-rail-${group}`}
        onClick={() => onToggle(group)}
        className={cn('inline-flex size-8 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground')}
      >
        {icon}
      </button>
    </Tooltip>
  );
  const moveTab = (event: KeyboardEvent, index: number) => {
    const step = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = RAIL_CARD_TABS[(index + step + RAIL_CARD_TABS.length) % RAIL_CARD_TABS.length];
    onTab(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  };
  const content: Record<Exclude<CardTab, 'favorites'>, ReactNode> = { conditions, overview, trades };
  return (
    <>
      <div className="absolute inset-y-0 right-0 z-[60] flex w-10 flex-col items-center gap-1 border-l border-border bg-background pt-2" data-testid="chart-rail" role="toolbar" aria-orientation="vertical" aria-label={t('chart.rail.label')}>
        {railButton('card', cardOpen, t('chart.rail.card'), t('chart.rail.card.hint'), <LayoutList size={16} aria-hidden="true" />)}
        {railButton('favorites', favoritesOpen, t('chart.rail.favorites'), t('chart.rail.favorites.hint'), <Bookmark size={16} aria-hidden="true" className={cn(favoritesOpen && 'fill-primary')} />)}
      </div>
      {open && (
        <div className="absolute inset-y-0 right-10 z-[60] flex w-72 flex-col border-l border-border bg-background" data-testid="chart-panel" data-panel={tab === 'favorites' ? 'favorites' : 'card'}>
          {tab === 'favorites' ? (
            <>
              <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-border pl-3 pr-1.5">
                <strong className="text-xs">{t('chart.card.favorites')}</strong>
                {favoritesAction}
              </div>
              <div className="flex min-h-0 flex-1 flex-col" data-testid="favorites-panel">{favorites}</div>
            </>
          ) : (
            <>
              {/* The title of the setup stays visible, as in the header of the old floating card */}
              <CardTitle title={title} form={form} className="shrink-0 border-b border-border px-3 py-1.5 text-xs" testId="chart-panel-title" />
              <div className="flex h-[38px] shrink-0 items-center border-b border-border px-1.5">
                <div role="tablist" aria-label={title} className="flex h-full items-center gap-0.5">
                  {RAIL_CARD_TABS.map((id, index) => (
                    <Tooltip key={id} content={t(`chart.card.${id}.hint`)} role="presentation">
                      <button
                        type="button"
                        role="tab"
                        id={`${base}-tab-${id}`}
                        aria-controls={`${base}-panel`}
                        aria-selected={id === tab}
                        data-testid={`chart-card-tab-${id}`}
                        tabIndex={id === tab ? 0 : -1}
                        onKeyDown={(event) => moveTab(event, index)}
                        onClick={() => onTab(id)}
                        className={cn(
                          'inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          id === tab ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        {t(`chart.card.${id}`)}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
              <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab}`} className={cn('flex min-h-0 flex-1 flex-col', tab !== 'conditions' && 'overflow-auto p-3')}>
                {content[tab]}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
