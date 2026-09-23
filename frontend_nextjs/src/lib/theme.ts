// Tema yardımcıları: hem sunucu (layout'taki inline script) hem istemci (useThemeStore) kullanır.
// Bu dosyada 'use client' olmamalı; layout.tsx bir Server Component.

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['light', 'dark', 'system'];
export const THEME_STORAGE_KEY = 'grid-robot-theme';
// Uygulama eskiden yalnızca koyu temaydı; tercih yoksa mevcut görünüm korunur
export const DEFAULT_THEME: ThemePreference = 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === 'string' && (THEME_PREFERENCES as string[]).includes(v);
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(theme: ThemePreference): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

export function watchSystemTheme(onChange: () => void): () => void {
  const mql = window.matchMedia(DARK_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// İlk paint'ten önce <head>'de senkron çalışır (FOUC önleme). Zustand persist formatını okur:
// {"state":{"theme":"..."},"version":0}
export const THEME_INIT_SCRIPT = `(function(){try{var t=${JSON.stringify(DEFAULT_THEME)};var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(s){var p=JSON.parse(s);var v=p&&p.state&&p.state.theme;if(${JSON.stringify(THEME_PREFERENCES)}.indexOf(v)>-1)t=v}if(t==="system")t=window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}catch(e){}})()`;
