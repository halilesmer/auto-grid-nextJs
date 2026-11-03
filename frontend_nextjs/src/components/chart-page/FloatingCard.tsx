'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, type HintContent } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export interface FloatingCardTab {
  id: string;
  label: string;
  hint: HintContent;
  content: ReactNode;
  /** Breite der Karte auf diesem Reiter (Tailwind-Klasse ab lg); Standard w-80 */
  wide?: boolean;
}

/**
 * Schwebende Karte auf dem Chart mit Titel, Reitern und Einklappen. Ab lg rechts unter der Kopfleiste (`--chart-top`, ChartOverlays),
 * darunter unten über den Werkzeugen des Charts und dort zunächst eingeklappt.
 */
export function FloatingCard({ title, tabs }: { title: string; tabs: FloatingCardTab[] }) {
  const t = useT();
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [tabId, setTabId] = useState(tabs[0].id);
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0];
  return (
    <aside
      aria-label={title}
      data-testid="chart-floating-card"
      className={cn(
        'pointer-events-auto absolute flex max-h-[calc(100dvh-var(--chart-top,0px)-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-background/97 shadow-lg',
        'max-lg:bottom-[5.5rem] max-lg:left-[64px] max-lg:right-3 lg:right-[84px] lg:top-[calc(var(--chart-top,0px)+0.5rem)]',
        tab.wide ? 'lg:w-[min(46rem,calc(100%-9rem))]' : 'lg:w-80',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <strong className="min-w-0 truncate text-xs">{title}</strong>
        <Button
          size="icon-xs"
          variant="ghost"
          hint={t(open ? 'chart.card.collapse.hint' : 'chart.card.expand.hint')}
          aria-label={t(open ? 'chart.card.collapse' : 'chart.card.expand')}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </Button>
      </div>
      {open && (
        <>
          {tabs.length > 1 && (
            <div role="tablist" className="flex gap-0.5 border-t border-border px-2 pt-1.5">
              {tabs.map((x) => (
                <Tooltip key={x.id} content={x.hint} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={x.id === tab.id}
                    onClick={() => setTabId(x.id)}
                    className={cn(
                      'inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      x.id === tab.id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {x.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
          <div role="tabpanel" className="min-h-0 overflow-y-auto border-t border-border p-3">
            {tab.content}
          </div>
        </>
      )}
    </aside>
  );
}
