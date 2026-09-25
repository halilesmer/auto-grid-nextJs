import { useCallback, useMemo } from 'react';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { Locale } from './config';
import { makeFormatters, type Formatters } from './format';
import { translate, type MessageKey, type Params } from './translate';

export type { Locale, MessageKey, Params };
export { LOCALES, LOCALE_NAMES } from './config';
export { makeFormatters, type Formatters };

/** Bileşenler için: dil değişince yeniden render eder. */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback((key: MessageKey, params?: Params) => translate(locale, key, params), [locale]);
}

/** Bileşen dışı kod (hook içi toast, apiError, store, WebSocket): anlık dili okur, reaktif değildir. */
export function t(key: MessageKey, params?: Params): string {
  return translate(useLocaleStore.getState().locale, key, params);
}

export function useLocale(): Locale {
  return useLocaleStore((s) => s.locale);
}

/** Sayı/saat biçimi, seçili dile göre. */
export function useFormat(): Formatters {
  const locale = useLocale();
  return useMemo(() => makeFormatters(locale), [locale]);
}
