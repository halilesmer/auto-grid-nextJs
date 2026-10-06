/**
 * Pythons round() und Festkomma-Formatierung, Bit für Bit wie CPython.
 * Quelle: CPython float.__round__ / format(x, ".nf") (korrekt gerundet, halbe Werte zur geraden Ziffer).
 *
 * Gerundet wird auf dem exakten Binärwert des Doubles (Mantisse · 2^e, BigInt), nicht auf der
 * Dezimaldarstellung: round(2.675, 2) = 2.67, weil 2.675 binär etwas kleiner ist; round(0.125, 2) = 0.12
 * (exakter Halbwert → gerade). Number.prototype.toFixed rundet exakte Halbwerte dagegen immer auf.
 * Prüfung: worker_python/tests/parity/golden/pyround.json (BKT-02).
 */

const TWO = BigInt(2);
const TEN = BigInt(10);
const ZERO = BigInt(0);
const ONE = BigInt(1);

/** |x| = mantissa · 2^exp (x endlich, ungleich 0) */
function decompose(x: number): { mantissa: bigint; exp: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> BigInt(52)) & BigInt(0x7ff));
  const fraction = bits & ((ONE << BigInt(52)) - ONE);
  if (biased === 0) return { mantissa: fraction, exp: -1074 };
  return { mantissa: fraction | (ONE << BigInt(52)), exp: biased - 1075 };
}

/** |x| · 10^ndigits, halbe Werte zur geraden Zahl gerundet, als ganze Zahl */
function scaledInteger(x: number, ndigits: number): bigint {
  const { mantissa, exp } = decompose(x);
  const num = mantissa * TEN ** BigInt(ndigits);
  if (exp >= 0) return num << BigInt(exp);
  const den = ONE << BigInt(-exp);
  const q = num / den;
  const twice = (num % den) * TWO;
  if (twice > den || (twice === den && q % TWO !== ZERO)) return q + ONE;
  return q;
}

/** Wie Python f"{x:.{ndigits}f}" (ndigits ≥ 0) */
export function pyFormatFixed(x: number, ndigits: number): string {
  if (!Number.isInteger(ndigits) || ndigits < 0 || ndigits > 100) {
    throw new RangeError(`pyFormatFixed: ndigits must be an integer 0…100, got ${ndigits}`);
  }
  if (!Number.isFinite(x)) return String(x);
  const digits = x === 0 ? '0' : scaledInteger(x, ndigits).toString();
  const padded = digits.padStart(ndigits + 1, '0');
  const intPart = padded.slice(0, padded.length - ndigits);
  const sign = x < 0 || Object.is(x, -0) ? '-' : '';
  return ndigits > 0 ? `${sign}${intPart}.${padded.slice(-ndigits)}` : `${sign}${intPart}`;
}

/**
 * Wie Python round(x) bzw. round(x, ndigits).
 * Ohne ndigits liefert Python eine ganze Zahl (int, nie -0); mit ndigits ein float, der -0.0 sein kann.
 */
export function pyRound(x: number, ndigits?: number): number {
  if (!Number.isFinite(x)) return x;
  if (ndigits === undefined) {
    const r = Number(pyFormatFixed(x, 0));
    return r === 0 ? 0 : r;
  }
  return Number(pyFormatFixed(x, ndigits));
}
