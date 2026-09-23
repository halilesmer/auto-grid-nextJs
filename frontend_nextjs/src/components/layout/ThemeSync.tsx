'use client';

import { useEffect, useLayoutEffect } from 'react';
import { useThemeStore } from '@/store';
import { applyTheme, watchSystemTheme } from '@/lib/theme';

// Store'u localStorage'dan yükler, <html>'e .dark class'ını uygular ve 'system' modunda OS'u izler.
// İlk yüklemedeki class'ı layout'taki inline script koyar; bu bileşen sonrasını yönetir.
export default function ThemeSync() {
  const theme = useThemeStore((s) => s.theme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  useLayoutEffect(() => {
    useThemeStore.persist.rehydrate();
  }, []);

  // Dev'de Strict Mode remount'u <html> class'larını JSX'tekine sıfırlar; burada tekrar uygulanır
  useLayoutEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (theme !== 'system') return;
    return watchSystemTheme(() => useThemeStore.getState().refreshResolvedTheme());
  }, [theme]);

  return null;
}
