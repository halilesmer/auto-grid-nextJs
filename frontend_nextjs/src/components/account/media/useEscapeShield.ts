import { useEffect, useRef } from 'react';

/**
 * Önizleme ya da silme sorusu açıkken Escape yalnız onu kapatsın, hesap formunu (native <dialog>) değil
 * (1108-A1.4). Pencere yakalama aşamasında durdurulur: form diyaloğunun onKeyDown'u ve Modal'ın kendi
 * dinleyicisi hiç görmez.
 */
export function useEscapeShield(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  useEffect(() => {
    handler.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      handler.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}
