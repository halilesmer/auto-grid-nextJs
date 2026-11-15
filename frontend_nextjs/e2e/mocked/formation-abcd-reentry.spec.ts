/**
 * AB=CD Yeniden giriş (1114-A4.4): iki hedef alındıktan sonra fiyat D'deki Engulf bölgesine döner.
 * Elle hesaplanmış kerze dizileri. Satış: giriş 144, stop 150, C 114, uç 144.5 → TP1 132.854, TP2 125.651.
 * Bölge 143–145 (D'deki Engulf bölgesi), karşı bölge 118–119. Alış: tüm fiyatlar aynalanır (p → 200 − p).
 */
import { expect, test } from '@playwright/test';
import { reentryOf } from '../../src/lib/formation/reentry';
import { tradeStatusOf } from '../../src/lib/formation/tradeStatus';
import type { EarlyZone } from '../../src/lib/formation/earlyReversal';
import type { EngulfZone } from '../../src/lib/formation/sig';
import type { FormationBar } from '../../src/lib/formation/types';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-05' }, fn);

/** [yüksek, düşük, kapanış] */
type Sk = [number, number, number];
const ZONE = { bottom: 143, top: 145 };
const OPPOSING = { bottom: 118, top: 119 };

function run(side: 'sell' | 'buy', rows: Sk[], over: { noZone?: boolean; noOpposing?: boolean } = {}) {
  const m = (p: number) => (side === 'sell' ? p : 200 - p);
  const rect = (r: { bottom: number; top: number }) => (side === 'sell' ? r : { bottom: m(r.top), top: m(r.bottom) });
  const bars: FormationBar[] = rows.map(([h, l, c], i) => {
    const [hh, ll] = side === 'sell' ? [h, l] : [m(l), m(h)];
    return { time: 1000 + i * 14400, open: m(c), high: hh, low: ll, close: m(c) };
  });
  // 0 = bölgeyi kuran Engulf mumu, 1 = D ve giriş mumu
  const status = tradeStatusOf({ bars, entryIdx: 1, side, entry: m(144), stop: m(150), emergencyStop: null, from: m(114), targets: { tp1: 0.382, tp2: 0.618 } });
  const engulfZones: EngulfZone[] = over.noZone ? [] : [{ side, idx: 0, rect: rect(ZONE), big: true, holds: true }];
  const zones: EarlyZone[] = over.noOpposing ? [] : [{ side: side === 'sell' ? 'support' : 'resistance', rect: rect(OPPOSING) }];
  return { m, status, re: reentryOf({ bars, side, dIdx: 1, status, engulfZones, zones }) };
}

const START: Sk[] = [
  [143.5, 141, 142], // 0: bölgeyi kuran mum
  [144.5, 140, 141], // 1: D ve giriş
];
const TP1: Sk = [141, 132, 135];
const TP2: Sk = [133, 125, 126];

for (const side of ['sell', 'buy'] as const) {
  const tag = side === 'sell' ? 'Satış' : 'Alış';

  frm(`Yeniden giriş (${tag}): TP1 ve TP2 sonrası bölgeye temas → giriş yakın kenar, stop uzak kenar, hedef karşı bölge`, () => {
    const { m, status, re } = run(side, [...START, TP1, TP2, [143.5, 130, 140]]);
    expect(status.kind).toBe('tp12');
    expect(status.tp2Idx).toBe(3);
    expect(re).toMatchObject({ kind: 'reentry', idx: 4 });
    if (re?.kind !== 'reentry') throw new Error('beklenen: yeniden giriş');
    expect(re.entry).toBeCloseTo(m(143), 9);
    expect(re.stop).toBeCloseTo(m(145), 9);
    expect(re.target).toBeCloseTo(m(119), 9);
  });

  frm(`Yeniden giriş (${tag}): temas yoksa durum doğmaz`, () => {
    expect(run(side, [...START, TP1, TP2, [138, 130, 135]]).re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): temas mumu bölgenin ötesinde kapanırsa doğmaz`, () => {
    expect(run(side, [...START, TP1, TP2, [146, 130, 145.5]]).re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): temasdan sonra bir mum bölgenin ötesinde kapanırsa geçersiz olur`, () => {
    expect(run(side, [...START, TP1, TP2, [143.5, 130, 140], [147, 140, 146]]).re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): temas TP2'den önceyse sayılmaz`, () => {
    // TP1 mumundan sonra bölgeye temas, TP2 daha sonra: temas TP2 sonrası değil
    const { status, re } = run(side, [...START, TP1, [143.2, 133, 138], TP2]);
    expect(status.kind).toBe('tp12');
    expect(re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): karşı bölge yoksa hedef boş`, () => {
    const { re } = run(side, [...START, TP1, TP2, [143.5, 130, 140]], { noOpposing: true });
    expect(re).toMatchObject({ kind: 'reentry', target: null });
  });

  frm(`Yeniden giriş (${tag}): yalnız TP1 alınmış ve bölgeye dönülmüşse yalnız uyarı`, () => {
    const { status, re } = run(side, [...START, TP1, [143.2, 133, 138]]);
    expect(status.kind).toBe('tp1');
    expect(re).toEqual({ kind: 'tp1Only', idx: 3 });
  });

  frm(`Yeniden giriş (${tag}): yalnız TP1 ve bölge ötesinde kapanış → uyarı da yok`, () => {
    expect(run(side, [...START, TP1, [146, 133, 145.5]]).re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): TP1 alınmadan (açık ya da stop) hiçbiri`, () => {
    expect(run(side, [...START, [143.5, 138, 140]]).re).toBeNull();
    expect(run(side, [...START, [151, 140, 151]]).re).toBeNull();
  });

  frm(`Yeniden giriş (${tag}): D'de Engulf bölgesi yoksa ne durum ne uyarı`, () => {
    expect(run(side, [...START, TP1, TP2, [143.5, 130, 140]], { noZone: true }).re).toBeNull();
    expect(run(side, [...START, TP1, [143.2, 133, 138]], { noZone: true }).re).toBeNull();
  });
}
