'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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
}

/**
 * Karte des Charts mit Titel, Reitern und Einklappen. Ab lg steht sie offen neben dem Chart (320 px; `OneChart` macht den Chart um ihre Breite schmaler, 1107-A21.18),
 * zugeklappt ist sie ein kleiner Kopf rechts über dem Chart, unter der Kopfleiste (`--chart-top`, ChartOverlays),
 * darunter unten über den Werkzeugen (zwei Zeilen hoch) des Charts und dort zunächst eingeklappt. Eingeklappt unter lg steht sie in einem
 * eigenen Streifen über den Werkzeugen: ihre Höhe steht als `--floating-card` auf `formation-main`, die Chartfläche endet darüber (ChartCore),
 * damit sie den untersten Bereich (EWO) nicht verdeckt. Unter lg liegt sie aufgeklappt über dem Chart.
 */
export function FloatingCard({ title, tabs, defaultOpen = true, collapseSignal = false, open: openProp, onOpenChange, tab: tabProp, onTabChange }: { title: string; tabs: FloatingCardTab[]; /** Gesteuert (ChartCard): Auf/Zu und Reiter kommen von außen und bleiben im Browser */ open?: boolean; onOpenChange?: (open: boolean) => void; tab?: string; onTabChange?: (id: string) => void; /** Ab lg zunächst aufgeklappt; mit false zunächst zu */ defaultOpen?: boolean; /** Wechselt auf true: die Karte klappt zu (der eine Chart: die offene Karte würde die Formationszeichnung rechts überdecken); danach gilt wieder die Wahl des Nutzers */ collapseSignal?: boolean }) {
  const t = useT();
  // The user's click wins; until then the card follows the defaults (open from lg) and the signal (closed while a formation is drawn)
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = openProp ?? userOpen ?? (defaultOpen && !collapseSignal && (typeof window === 'undefined' || window.innerWidth >= 1024));
  const setOpen = onOpenChange ?? setUserOpen;
  const [ownTabId, setOwnTabId] = useState(tabs[0].id);
  const tabId = tabProp ?? ownTabId;
  const setTabId = onTabChange ?? setOwnTabId;
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0];
  const base = useId();
  const card = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = card.current, page = el?.closest<HTMLElement>('[data-testid="formation-main"]');
    if (!el || !page) return;
    const measure = () => page.style.setProperty('--floating-card', !open && !window.matchMedia('(min-width: 64rem)').matches ? `${el.offsetHeight + 4}px` : '0px');
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); page.style.removeProperty('--floating-card'); };
  }, [open]);
  const moveTab = (event: KeyboardEvent, index: number) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setTabId(next.id);
    document.getElementById(`${base}-tab-${next.id}`)?.focus();
  };
  return (
    <aside
      ref={card}
      aria-label={title}
      data-testid="chart-floating-card"
      className={cn(
        'pointer-events-auto absolute max-lg:z-[52] flex max-h-[calc(100dvh-var(--chart-top,0px)-8rem)] max-lg:max-h-[calc(100dvh-var(--chart-top,0px)-9.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-background/97 shadow-lg',
        'max-lg:left-[64px] max-lg:right-3 lg:top-[calc(var(--chart-top,0px)+0.5rem)]',
        // Open from lg: the card stands next to the chart (the chart is 320 px narrower, OneChart); closed it is a small header over the chart (1107-A21.18)
        open ? 'lg:left-full lg:right-auto' : 'lg:right-[84px]',
        open ? 'max-lg:bottom-[8.5rem]' : 'max-lg:bottom-[calc(var(--workspace-card,6.5rem)+0.25rem)]',
        'lg:w-80',
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
            <div role="tablist" aria-label={title} className="flex gap-0.5 border-t border-border px-2 pt-1.5">
              {tabs.map((x, index) => (
                <Tooltip key={x.id} content={x.hint} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    id={`${base}-tab-${x.id}`}
                    aria-controls={`${base}-panel`}
                    aria-selected={x.id === tab.id}
                    data-testid={`chart-card-tab-${x.id}`}
                    tabIndex={x.id === tab.id ? 0 : -1}
                    onKeyDown={(event) => moveTab(event, index)}
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
          <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${tab.id}`} className="min-h-0 overflow-auto border-t border-border p-3">
            {tab.content}
          </div>
        </>
      )}
    </aside>
  );
}
