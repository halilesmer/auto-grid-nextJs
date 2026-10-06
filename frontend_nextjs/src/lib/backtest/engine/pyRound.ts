/**
 * Pythons round() für den Bot-Nachbau (BKT-02). Quelle: CPython `float.__round__`.
 *
 * Python rundet den exakten Binärwert des Doubles auf `ndigits` Stellen und nur echte Hälften
 * (exakt darstellbar, z. B. 0.125) zur geraden Ziffer. `toFixed` rundet Hälften dagegen auf;
 * 2.675 (binär 2.67499…) gibt in beiden 2.67. Deshalb wird hier exakt mit BigInt gerechnet.
 * Festgehalten in worker_python/tests/parity/golden/pyround.json.
 */

const view = new DataView(new ArrayBuffer(8));
// BigInt() statt Literalen (10n …): tsconfig target ist ES2017
const B0 = BigInt(0);
const B1 = BigInt(1);
const B2 = BigInt(2);
const B10 = BigInt(10);

/** |x| = mant · 2^exp (exakt) */
function decompose(x: number): { mant: bigint; exp: number } {
  view.setFloat64(0, Math.abs(x));
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const biased = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo);
  if (biased === 0) return { mant, exp: -1074 };
  mant |= B1 << BigInt(52);
  return { mant, exp: biased - 1075 };
}

/** round(x, ndigits) wie in Python (ndigits ≥ 0); ohne ndigits wie round(x) (ganze Zahl). */
export function pyRound(x: number, ndigits = 0): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const { mant, exp } = decompose(x);
  if (exp >= 0) return x; // ganze Zahl, nichts zu runden
  const den = B1 << BigInt(-exp);
  const num = mant * B10 ** BigInt(ndigits);
  let q = num / den;
  const twice = (num - q * den) * B2;
  if (twice > den || (twice === den && q % B2 === B1)) q += B1;
  const sign = x < 0 ? -1 : 1;
  if (q === B0) return sign * 0;
  return sign * Number(`${q}e-${ndigits}`);
}
