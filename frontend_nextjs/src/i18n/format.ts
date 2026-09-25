import { INTL_TAGS, type Locale } from './config';

// Saf biçimleyiciler (React/Zustand yok): hem arayüz hem e2e testleri kullanır.
export interface Formatters {
  locale: Locale;
  number: (value: number, opts?: Intl.NumberFormatOptions) => string;
  money: (value: number, signed?: boolean) => string;
  /** Symbolpreis mit festen Nachkommastellen (Symbol-Digits), ohne Währungszeichen. */
  price: (value: number, digits?: number) => string;
  time: (value: Date | number | string) => string;
  dateTime: (value: Date | number | string) => string;
}

export function makeFormatters(locale: Locale): Formatters {
  const tag = INTL_TAGS[locale];
  return {
    locale,
    number: (value, opts) => value.toLocaleString(tag, opts),
    money: (value, signed = false) => {
      const abs = Math.abs(value).toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (value < 0) return `-$${abs}`;
      return signed && value > 0 ? `+$${abs}` : `$${abs}`;
    },
    price: (value, digits = 2) =>
      value.toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    time: (value) => new Date(value).toLocaleTimeString(tag, { hour12: false }),
    dateTime: (value) => new Date(value).toLocaleString(tag, { hour12: false }),
  };
}
