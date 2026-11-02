'use client';

import type { ReactNode } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import type { SidebarTab } from '@/hooks/useFormationSidebar';
import { cn } from '@/lib/utils';

/** Reiterleiste der Seitenleiste, 38 px hoch wie die Kopfleiste; `trailing` steht rechts (Aktion des aktiven Reiters). */
export function FormationSidebarTabs({ tab, onTab, trailing }: { tab: SidebarTab; onTab: (tab: SidebarTab) => void; trailing?: ReactNode }) {
  const t = useT();
  const tabs: { id: SidebarTab; label: string; hint: string }[] = [
    { id: 'conditions', label: t('formation.conditions'), hint: t('formation.conditions.hint') },
    { id: 'favorites', label: t('formation.fav.title'), hint: t('formation.fav.toggle.hint') },
  ];
  return (
    <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-border pl-1.5 pr-1.5">
      <div role="tablist" aria-label={t('formation.sidebar.tabs')} className="flex h-full items-center gap-0.5">
        {tabs.map((item) => (
          <Tooltip key={item.id} content={item.hint} role="presentation">
            <button
              type="button"
              role="tab"
              id={`formation-tab-${item.id}`}
              aria-selected={tab === item.id}
              data-testid={`sidebar-tab-${item.id}`}
              onClick={() => onTab(item.id)}
              className={cn(
                'inline-flex h-7 cursor-pointer items-center rounded-[5px] px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                tab === item.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          </Tooltip>
        ))}
      </div>
      {trailing}
    </div>
  );
}
