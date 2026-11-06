'use client';

import { useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDock } from './DockProvider';

const subscribeNone = () => () => {};

/**
 * Sabit hesap çapası (UI-17, plan 1106-A1.1, S4): hesap seçimi + DEMO/LIVE işareti. Paket değildir: tutamacı yok, sürüklenmez, ok menüsüne girmez.
 * Satır 1'de sırada bir yer tutar (komşular soluna ve sağına dizilir). Kutu bir kez kurulur ve DockProvider onu Satır 1'e koyar;
 * içerik oraya portal edilir (durum ve açık menüler kalır). Hangi hesapta (canlı mı, demo mu) çalışıldığı her zaman görünür: güvenlik işareti.
 */
export function DockAnchor({ children, className }: { children: ReactNode; className?: string }) {
  const dock = useDock();
  const mounted = useSyncExternalStore(subscribeNone, () => true, () => false);
  const [wrap] = useState<HTMLDivElement | null>(() => {
    if (typeof document === 'undefined') return null;
    const el = document.createElement('div');
    el.className = 'dock-wrap'; el.dataset.dockWrap = 'account'; el.dataset.dockAnchor = '';
    return el;
  });
  const register = dock?.registerAccount;
  useLayoutEffect(() => {
    if (!wrap || !register) return;
    register(wrap);
    return () => { register(null); wrap.remove(); };
  }, [wrap, register]);
  if (!dock || !wrap || !mounted) return null;
  return createPortal(<div data-testid="dock-account" className={className}>{children}</div>, wrap);
}
