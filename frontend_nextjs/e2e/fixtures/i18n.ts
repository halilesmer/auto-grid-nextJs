/**
 * Texte der Oberfläche in den Tests aus denselben Wörterbüchern wie die App (src/i18n/messages),
 * statt sie als Literale zu duplizieren: ändert sich ein Text, bleiben die Tests grün.
 * Standard ist `tr` (Standardsprache der App); mit `test.use({ appLocale: 'de' })` laufen Tests in
 * einer anderen Sprache und rufen dann `msg(key, params, 'de')` auf.
 */
import { makeFormatters } from '../../src/i18n/format';
import { translate, type MessageKey, type Params } from '../../src/i18n/translate';

export type { MessageKey };

export type Lang = 'tr' | 'en' | 'de';

export function msg(key: MessageKey, params?: Params, lang: Lang = 'tr'): string {
  return translate(lang, key, params);
}

/** Zahlen-/Zeitformat der Oberfläche (z. B. `fmt().money(97.25)` → "$97,25" in tr). */
export function fmt(lang: Lang = 'tr') {
  return makeFormatters(lang);
}
