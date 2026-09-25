'use client';

import { useLayoutEffect } from 'react';
import { useLocaleStore } from '@/store/useLocaleStore';

// Store'u localStorage'dan yükler ve <html lang>'ı seçili dile ayarlar.
// İlk yüklemedeki lang'ı layout'taki inline script koyar; bu bileşen sonrasını yönetir.
export default function LocaleSync() {
  const locale = useLocaleStore((s) => s.locale);

  useLayoutEffect(() => {
    useLocaleStore.persist.rehydrate();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
