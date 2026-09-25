import { DEFAULT_LOCALE, INTL_TAGS, type Locale } from './config';
import { de, en, tr, type MessageKey } from './messages';

export type { MessageKey };
export type Params = Record<string, string | number>;

const MESSAGES: Record<Locale, Record<string, string>> = { tr, en, de };

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/**
 * Anahtarı çevirir. `{ad}` yer tutucuları params ile doldurulur.
 * Çoğul: `params.count` verilirse önce `<key>_one` / `<key>_other` aranır.
 * Yedek sıra: seçili dil → varsayılan dil → anahtarın kendisi.
 */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  let k: string = key;
  if (params && typeof params.count === 'number') {
    const form = new Intl.PluralRules(INTL_TAGS[locale]).select(params.count);
    const plural = `${key}_${form === 'one' ? 'one' : 'other'}`;
    if (plural in MESSAGES[locale]) k = plural;
  }
  return interpolate(MESSAGES[locale][k] ?? MESSAGES[DEFAULT_LOCALE][k] ?? key, params);
}
