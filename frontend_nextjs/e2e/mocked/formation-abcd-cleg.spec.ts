/**
 * AB=CD C ayağı (2026-11-16): D'ye (seviye 1) ulaşılmadan, C'den D'ye doğru, AB=CD işleminin ters yönünde bir işlem.
 * Elle hesaplanmış kerze dizileri. Satış AB=CD'si: A 100, B 130, C 114 (derinlik 0,533), seviye 1 = 144; C ayağı alıştır.
 * Alış AB=CD'si: tüm fiyatlar aynalanır (p → 200 − p), C ayağı satıştır.
 * Bölge 113–115 (C'deki bölge), ATR 2 → acil stop = stop ∓ 2.
 */
import { expect, test } from '@playwright/test';
import { shapeOf } from '../../src/lib/formation/abcd';
import { cLegOf, type CLegFractalZone, type LowerCandle } from '../../src/lib/formation/cLeg';
import type { EngulfZone } from '../../src/lib/formation/sig';
import type { CheckState, CLeg, CLegRow, FormationBar, Side } from '../../src/lib/formation/types';

const frm = (name: string, fn: () => void) => test(name, { tag: ['@FRM-05', '@FRM-39'] }, fn);

/** [yüksek, düşük, kapanış] */
type Sk = [number, number, number];
/** 0 dolgu, 1 A (dip 100), 2 B (tepe 130), 3 ara (bölgeyi kuran mum), 4 C (dip 114), sonra C'den sonraki mumlar */
const BASE: Sk[] = [
  [105, 101, 103],
  [102, 100, 101],
  [130, 120, 125],
  [126, 115, 118],
  [116, 114, 115],
];
const AFTER: Sk = [120, 115, 119];
const ZONE = { bottom: 113, top: 115 };
const T0 = 1000;
const STEP = 14400;

interface Over {
  rows?: Sk[];
  engulf?: { rect?: { bottom: number; top: number }; holds?: boolean }[];
  fractal?: { rect?: { bottom: number; top: number }; strength: 0 | 1 | 2; late?: boolean }[];
  candle?: { state: CheckState; close?: number; tip?: number; tf?: string };
  withTrend?: boolean | null;
  noDivergence?: CheckState;
  reached?: boolean;
  early?: boolean;
  /** C yerine bu fiyat (alış AB=CD'si aynasında 200 − p değil, doğrudan satış tabanlı p) */
  cLow?: number;
}

function run(abSide: Side, over: Over = {}): { cl: CLeg | null; m: (p: number) => number } {
  const sell = abSide === 'sell';
  const m = (p: number) => (sell ? p : 200 - p);
  const rows = over.rows ?? [...BASE, AFTER];
  const bars: FormationBar[] = rows.map(([h, l, c], i) => {
    const [hh, ll] = sell ? [h, l] : [m(l), m(h)];
    return { time: T0 + i * STEP, open: m(c), high: hh, low: ll, close: m(c) };
  });
  const rect = (r: { bottom: number; top: number }) => (sell ? r : { bottom: m(r.top), top: m(r.bottom) });
  const legSide: Side = sell ? 'buy' : 'sell';
  const cPrice = over.cLow ?? 114;
  const s = shapeOf(bars, { a: { idx: 1, price: m(100) }, b: { idx: 2, price: m(130) }, c: { idx: 4, price: m(cPrice) } });
  const engulfZones: EngulfZone[] = (over.engulf ?? []).map((z) => ({ side: legSide, idx: 3, rect: rect(z.rect ?? ZONE), big: true, holds: z.holds ?? true }));
  const zones: CLegFractalZone[] = (over.fractal ?? []).map((z) => ({
    side: sell ? 'support' : 'resistance',
    rect: rect(z.rect ?? ZONE),
    strength: z.strength,
    fractalTimes: z.late ? [T0 + 4 * STEP] : [T0 + 2 * STEP, T0 + 3 * STEP],
  }));
  const c = over.candle;
  const candle: LowerCandle = c
    ? { state: c.state, ...(c.close === undefined ? {} : { close: m(c.close) }), ...(c.tip === undefined ? {} : { tip: m(c.tip) }), ...(c.tf ? { tf: c.tf } : {}) }
    : { state: 'unmet' };
  const cl = cLegOf({
    bars,
    s,
    reached: over.reached ?? false,
    early: over.early ?? false,
    withTrend: over.withTrend === undefined ? false : over.withTrend,
    noDivergence: over.noDivergence ?? 'met',
    engulfZones,
    zones,
    candle,
    atr: 2,
  });
  return { cl, m };
}

const row = (cl: CLeg, key: CLegRow['key']): CLegRow => {
  const r = cl.rows.find((x) => x.key === key);
  if (!r) throw new Error(`satır yok: ${key}`);
  return r;
};
const need = (cl: CLeg | null): CLeg => {
  if (!cl) throw new Error('beklenen: C ayağı');
  return cl;
};

for (const abSide of ['sell', 'buy'] as const) {
  const tag = abSide === 'sell' ? 'Satış AB=CD (alış C ayağı)' : 'Alış AB=CD (satış C ayağı)';

  frm(`C ayağı (${tag}): C'de Engulf bölgesi → bölge varyantı, giriş yakın kenar, stop uzak kenar, hedef seviye 1`, () => {
    const { cl: raw, m } = run(abSide, { engulf: [{}] });
    const cl = need(raw);
    expect(cl.side).toBe(abSide === 'sell' ? 'buy' : 'sell');
    expect(cl.variant).toBe('zone');
    expect(cl.entry).toBeCloseTo(m(115), 9);
    expect(cl.stop).toBeCloseTo(m(113), 9);
    expect(cl.emergencyStop).toBeCloseTo(m(111), 9);
    expect(cl.target).toBeCloseTo(m(144), 9);
    expect(row(cl, 'depth')).toMatchObject({ kind: 'required', state: 'met' });
    expect(row(cl, 'depth').value as number).toBeCloseTo(16 / 30, 9);
    expect(row(cl, 'trend')).toMatchObject({ kind: 'required', state: 'met' });
    expect(row(cl, 'noDivergence')).toMatchObject({ kind: 'required', state: 'met' });
    expect(row(cl, 'zone')).toMatchObject({ kind: 'bonus', state: 'met', value: 'engulf' });
    // bölge varsa dönüş mumu takviye
    expect(row(cl, 'candle')).toMatchObject({ kind: 'bonus', state: 'unmet' });
    expect(row(cl, 'lowerAbcd')).toMatchObject({ kind: 'bonus', state: 'unmeasurable' });
  });

  frm(`C ayağı (${tag}): bölge yok, alt zaman diliminde dönüş mumu var → mum varyantı`, () => {
    const { cl: raw, m } = run(abSide, { candle: { state: 'met', close: 118, tip: 116.5, tf: 'H1' } });
    const cl = need(raw);
    expect(cl.variant).toBe('candle');
    expect(cl.entry).toBeCloseTo(m(118), 9);
    expect(cl.stop).toBeCloseTo(m(116.5), 9);
    expect(cl.emergencyStop).toBeCloseTo(m(114.5), 9);
    expect(cl.target).toBeCloseTo(m(144), 9);
    expect(row(cl, 'zone')).toMatchObject({ kind: 'bonus', state: 'unmet' });
    expect(row(cl, 'candle')).toMatchObject({ kind: 'required', state: 'met', value: 'H1' });
  });

  frm(`C ayağı (${tag}): bölge yok, mum yok → değer yok, mum satırı zorunlu ve karşılanmamış`, () => {
    const cl = need(run(abSide).cl);
    expect(cl.variant).toBeNull();
    expect([cl.entry, cl.stop, cl.emergencyStop, cl.target]).toEqual([null, null, null, null]);
    expect(row(cl, 'candle')).toMatchObject({ kind: 'required', state: 'unmet' });
  });

  frm(`C ayağı (${tag}): alt zaman dilimi ölçülemiyorsa mum satırı zorunlu ve ölçülemedi, değer yok`, () => {
    const cl = need(run(abSide, { candle: { state: 'unmeasurable' } }).cl);
    expect(cl.variant).toBeNull();
    expect(cl.entry).toBeNull();
    expect(row(cl, 'candle')).toMatchObject({ kind: 'required', state: 'unmeasurable' });
  });

  frm(`C ayağı (${tag}): derinlik 0,382'nin altında → değer yok`, () => {
    // C 120: derinlik 10/30 = 0,333; bölge C'ye dokunur
    const rows: Sk[] = [...BASE.slice(0, 4), [122, 120, 121], AFTER];
    const cl = need(run(abSide, { rows, cLow: 120, engulf: [{ rect: { bottom: 119, top: 121 } }] }).cl);
    expect(row(cl, 'depth')).toMatchObject({ kind: 'required', state: 'unmet' });
    expect(row(cl, 'depth').value as number).toBeCloseTo(10 / 30, 9);
    expect(cl.variant).toBeNull();
    expect(cl.entry).toBeNull();
  });

  frm(`C ayağı (${tag}): tepelerde uyumsuzluk varsa değer yok`, () => {
    const cl = need(run(abSide, { engulf: [{}], noDivergence: 'unmet' }).cl);
    expect(row(cl, 'noDivergence')).toMatchObject({ kind: 'required', state: 'unmet' });
    expect(cl.variant).toBeNull();
    expect(cl.entry).toBeNull();
  });

  frm(`C ayağı (${tag}): trend C ayağına karşıysa ya da ölçülemiyorsa değer yok`, () => {
    // withTrend true: üst trend AB=CD yönünde, C ayağı trende karşı
    const against = need(run(abSide, { engulf: [{}], withTrend: true }).cl);
    expect(row(against, 'trend')).toMatchObject({ kind: 'required', state: 'unmet' });
    expect(against.entry).toBeNull();
    const unknown = need(run(abSide, { engulf: [{}], withTrend: null }).cl);
    expect(row(unknown, 'trend')).toMatchObject({ kind: 'required', state: 'unmeasurable' });
    expect(unknown.entry).toBeNull();
  });

  frm(`C ayağı (${tag}): seviye 1'e ulaşıldıysa bölüm yok`, () => {
    expect(run(abSide, { engulf: [{}], reached: true }).cl).toBeNull();
  });

  frm(`C ayağı (${tag}): C'den sonra bir mum bölgenin ötesinde kapattıysa bölüm yok`, () => {
    expect(run(abSide, { engulf: [{}], rows: [...BASE, [114, 111, 112], AFTER] }).cl).toBeNull();
    // kapanış bölgenin içinde kalırsa bölüm durur (uç ötesine inmek yetmez)
    expect(run(abSide, { engulf: [{}], rows: [...BASE, [114, 111, 113.5], AFTER] }).cl).not.toBeNull();
  });

  frm(`C ayağı (${tag}): mum varyantında stop ötesinde kapanış bölümü kapatır`, () => {
    const candle = { state: 'met', close: 118, tip: 116.5, tf: 'H1' } as const;
    expect(run(abSide, { candle, rows: [...BASE, [118, 115, 116]] }).cl).toBeNull();
    expect(run(abSide, { candle, rows: [...BASE, [118, 115, 117]] }).cl).not.toBeNull();
  });

  frm(`C ayağı (${tag}): erken dönüş durumu varken bölüm yok`, () => {
    expect(run(abSide, { engulf: [{}], early: true }).cl).toBeNull();
  });

  frm(`C ayağı (${tag}): zayıf fraktal bölgesi bölge sayılmaz, güçlü sayılır`, () => {
    const weak = need(run(abSide, { fractal: [{ strength: 0 }, { strength: 1 }] }).cl);
    expect(weak.variant).toBeNull();
    expect(row(weak, 'zone')).toMatchObject({ kind: 'bonus', state: 'unmet' });
    expect(row(weak, 'candle').kind).toBe('required');
    const { cl: raw, m } = run(abSide, { fractal: [{ strength: 2 }] });
    const strong = need(raw);
    expect(strong.variant).toBe('zone');
    expect(row(strong, 'zone')).toMatchObject({ state: 'met', value: 'fractal' });
    expect(strong.entry).toBeCloseTo(m(115), 9);
    expect(strong.stop).toBeCloseTo(m(113), 9);
  });

  frm(`C ayağı (${tag}): C mumundan sonra oluşan bölge ya da C'ye dokunmayan bölge sayılmaz`, () => {
    expect(need(run(abSide, { fractal: [{ strength: 2, late: true }] }).cl).variant).toBeNull();
    expect(need(run(abSide, { fractal: [{ strength: 2, rect: { bottom: 120, top: 122 } }] }).cl).variant).toBeNull();
    expect(need(run(abSide, { engulf: [{ rect: { bottom: 120, top: 122 } }] }).cl).variant).toBeNull();
  });

  frm(`C ayağı (${tag}): birden çok bölgede en yakın uzak kenar seçilir, tüketilen atlanır`, () => {
    // geniş bölge 110–115 (uzak kenar 110) ve dar bölge 113–115 (uzak kenar 113): dar olan önce
    const both = need(run(abSide, { engulf: [{ rect: { bottom: 110, top: 115 } }, {}] }).cl);
    expect(both.stop).toBeCloseTo(abSide === 'sell' ? 113 : 87, 9);
  });
}
