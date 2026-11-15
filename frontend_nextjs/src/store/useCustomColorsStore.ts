import { create } from 'zustand';
import { CUSTOM_COLORS_MAX } from '@/lib/userPrefs';

export { CUSTOM_COLORS_MAX };
/** Eski (USR-12 öncesi) cihaz önbelleği: değerler bir kez kullanıcı tercihlerine taşınır, sonra bu anahtar silinir. */
export const CUSTOM_COLORS_STORAGE_KEY = 'grid-robot-custom-colors-v1';

interface CustomColorsState {
  /** Kullanıcının „+“ ile eklediği renkler (`#rrggbb`), eklenme sırasıyla */
  colors: string[];
}

/**
 * Kayıtlı renkler kullanıcıya aittir ve worker'da (VPS) `chart_colors` anahtarında durur (USR-12).
 * Bu depo yalnız o değeri tutar; ekleme/silme `useUserPrefsStore` üzerinden (`addCustomColor`, `clearCustomColors`) kaydedilir.
 */
export const useCustomColorsStore = create<CustomColorsState>()(() => ({ colors: [] }));

/** Var olan renk sona taşınır; sınır aşılınca en eskisi düşer. Geçersiz renk listeyi değiştirmez. */
export function withColor(colors: string[], color: string): string[] {
  const c = color.toLowerCase();
  if (!/^#[\da-f]{6}$/.test(c)) return colors;
  return [...colors.filter((x) => x !== c), c].slice(-CUSTOM_COLORS_MAX);
}
