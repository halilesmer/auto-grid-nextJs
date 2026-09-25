/**
 * Grobe Richtwerte für Grid-Abstand und Take Profit gängiger Symbole (nur Anzeige im Tooltip).
 * Werte in Kurseinheiten (wie die Felder), keine Anlageberatung. Unbekanntes Symbol → null.
 */
export interface SymbolGuidance {
  group: string;
  step: readonly [number, number];
  tp: readonly [number, number];
}

interface Rule {
  group: string;
  match: RegExp;
  step: readonly [number, number];
  tp: readonly [number, number];
}

// Reihenfolge zählt: die erste passende Regel gewinnt.
const RULES: readonly Rule[] = [
  { group: 'gold', match: /^(XAUUSD|GOLD)/, step: [1, 5], tp: [1, 5] },
  { group: 'silver', match: /^(XAGUSD|SILVER)/, step: [0.05, 0.3], tp: [0.05, 0.3] },
  { group: 'btc', match: /^BTCUSD/, step: [100, 500], tp: [100, 500] },
  { group: 'eth', match: /^ETHUSD/, step: [5, 25], tp: [5, 25] },
  { group: 'us500', match: /^(US500|SPX500|SP500)/, step: [2, 10], tp: [2, 10] },
  { group: 'us30', match: /^(US30|DJ30|DJI30|WS30)/, step: [10, 50], tp: [10, 50] },
  { group: 'nas100', match: /^(NAS100|USTEC|US100|NDX100)/, step: [10, 50], tp: [10, 50] },
  { group: 'oil', match: /^(USOIL|USOUSD|XTIUSD|WTI|UKOIL|XBRUSD|BRENT)/, step: [0.2, 1], tp: [0.2, 1] },
  { group: 'fx_jpy', match: /^[A-Z]{3}JPY/, step: [0.1, 0.3], tp: [0.1, 0.3] },
  { group: 'fx_major', match: /^((EUR|GBP|AUD|NZD)USD|USD(CAD|CHF))/, step: [0.001, 0.003], tp: [0.001, 0.003] },
];

/** Broker-Zusätze (`XAUUSD.m`, `XAUUSDm`, `#XAUUSD`) stören nicht: nur Buchstaben/Ziffern, Prefix-Match. */
export function getSymbolGuidance(symbol: string | undefined): SymbolGuidance | null {
  const s = (symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return null;
  const rule = RULES.find((r) => r.match.test(s));
  return rule ? { group: rule.group, step: rule.step, tp: rule.tp } : null;
}
