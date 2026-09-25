// Dil yardımcıları: hem sunucu (layout'taki inline script) hem istemci (useLocaleStore) kullanır.
// Bu dosyada 'use client' olmamalı; layout.tsx bir Server Component.

export type Locale = 'tr' | 'en' | 'de';

export const LOCALES: Locale[] = ['tr', 'en', 'de'];
export const LOCALE_STORAGE_KEY = 'grid-robot-locale';
// Uygulama eskiden Türkçe'ydi; tercih yoksa mevcut görünüm korunur
export const DEFAULT_LOCALE: Locale = 'tr';

// Sayı/tarih biçimi için Intl etiketi
export const INTL_TAGS: Record<Locale, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  de: 'de-DE',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as string[]).includes(v);
}

// İlk paint'ten önce <head>'de senkron çalışır: <html lang> doğru olsun. Zustand persist formatını okur:
// {"state":{"locale":"..."},"version":0}
export const LOCALE_INIT_SCRIPT = `(function(){try{var l=${JSON.stringify(DEFAULT_LOCALE)};var s=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});if(s){var p=JSON.parse(s);var v=p&&p.state&&p.state.locale;if(${JSON.stringify(LOCALES)}.indexOf(v)>-1)l=v}document.documentElement.lang=l}catch(e){}})()`;
