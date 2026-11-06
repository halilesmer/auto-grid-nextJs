'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Ok menüsü (˅) bir paketin sağında (UI-17): satıra sığmayan düğmeler buraya girer. Menü, paketin içeriğini bir kez daha çizer ve
 * yalnız satırda gizlenen düğmeleri gösterir; böylece menüdeki düğme satırdakiyle aynı bileşendir: aynı işi yapar, aynı ipucunu taşır.
 * Ok, DockProvider'ın sığdırması ona kadar gizli durur (`hidden` elle yönetilir; React bu özelliği hiç yazmaz).
 */
export function DockOverflow({ content, up, label, children }: { content: RefObject<HTMLElement | null>; up: boolean; label: string; children: ReactNode }) {
  const t = useT();
  const [hiddenFlags, setHiddenFlags] = useState<boolean[] | null>(null);
  const arrow = useRef<HTMLSpanElement>(null), list = useRef<HTMLDivElement>(null);
  const open = hiddenFlags !== null;
  const close = () => setHiddenFlags(null);

  // Menüde yalnız satırda gizlenen öğeler görünür (kutudaki sıra aynı, çünkü içerik aynı)
  useLayoutEffect(() => {
    const box = list.current;
    if (!box || !hiddenFlags) return;
    [...box.children].forEach((child, i) => { (child as HTMLElement).hidden = !hiddenFlags[i]; });
    const a = arrow.current?.getBoundingClientRect();
    if (!a) return;
    box.style.left = `${Math.max(8, Math.min(a.left, window.innerWidth - box.offsetWidth - 8))}px`;
    box.style.top = up ? `${Math.max(8, a.top - box.offsetHeight - 6)}px` : `${a.bottom + 6}px`;
  });
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { const n = e.target as Node; if (!list.current?.contains(n) && !arrow.current?.contains(n)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); arrow.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <span ref={el => { if (el && !el.dataset.ready) { el.dataset.ready = '1'; el.hidden = true; } arrow.current = el; }} data-dock-more className="shrink-0">
      <Button size="icon-xs" variant="ghost" hint={t('cw.tbMore.hint')} aria-label={t('cw.tbMore')} aria-haspopup="true" aria-expanded={open} data-testid="dock-more"
        onClick={() => setHiddenFlags(open ? null : [...(content.current?.children ?? [])].filter(c => !c.hasAttribute('data-dock-more')).map(c => (c as HTMLElement).hidden))}>
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {open && createPortal(
        <div ref={list} role="group" aria-label={`${label}: ${t('cw.tbMore')}`} data-testid="dock-more-menu" data-menu={up ? 'up' : 'down'}
          // Bir düğmeye basınca menü kapanır. Kendi açılır paneli olan öğede (Ebenen, Trend ayarları: aria-expanded) menü açık kalır,
          // yoksa panel içindeki her tıklama paneli de kapatırdı
          onClick={e => {
            const target = e.target as HTMLElement, item = [...(list.current?.children ?? [])].find(c => c.contains(target));
            if (target.closest('button') && item && !item.querySelector('[aria-expanded]')) close();
          }}
          className={cn('group/tb fixed z-[90] flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-lg')}>
          {children}
        </div>, document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body,
      )}
    </span>
  );
}
