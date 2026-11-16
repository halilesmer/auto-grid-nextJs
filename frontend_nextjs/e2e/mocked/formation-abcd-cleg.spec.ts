/**
 * AB=CD C ayağı (2026-11-16): D'ye (seviye 1) ulaşılmadan, C'den D'ye doğru, AB=CD işleminin ters yönünde bir işlem.
 * Elle hesaplanmış kerze dizileri. Satış AB=CD'si: A 100, B 130, C 114 (derinlik 0,533), seviye 1 = 144; C ayağı alıştır.
 * Alış AB=CD'si: tüm fiyatlar aynalanır (p → 200 − p), C ayağı satıştır.
 * Bölge 113–115 (C'deki bölge), ATR 2 → acil stop = stop ∓ 2.
 */
import { expect, test } from '@playwright/test';
import { shapeOf } from '../../src/lib/formation/abcd';
import { cLegOf, lowerAbcdAt, type CLegFractalZone, type LowerAbcd, type LowerCandle } from '../../src/lib/formation/cLeg';
import type { Env } from '../../src/lib/formation/reasons';
import type { Pivot } from '../../src/lib/formation/trd';
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
  lower?: LowerAbcd;
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
    ...(over.lower ? { lowerAbcd: over.lower } : {}),
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

/**
 * Alt zaman diliminde AB=CD (2026-11-16): büyük (4 saatlik) mumlar run() ile aynı: B (idx 2) T0+2·STEP, C (idx 4) T0+4·STEP.
 * Alt zaman dilimi (1 saatlik) mumları B'den bir mum önce başlar; mum i'nin zamanı LT0 + i·3600. C mumunun aralığı 1 saatlik idx 9..12.
 * Satış AB=CD'sinin B→C düzeltmesi (130 → 114) içinde küçük AB=CD: a 128 (tepe), b 120 (dip), c 124 (tepe, derinlik 0,5), seviye 1 = 116, d 115,5.
 * Alış AB=CD'si aynalanır (p → 200 − p, tepe ↔ dip).
 */
const H = 3600;
const LT0 = T0 + 2 * STEP - H;
type Pv = { idx: number; top: boolean; price: number };
const SMALL: Pv[] = [
  { idx: 2, top: true, price: 128 },
  { idx: 4, top: false, price: 120 },
  { idx: 7, top: true, price: 124 },
  { idx: 10, top: false, price: 115.5 },
];

function lowerEnv(abSide: Side, pv: Pv[], o: { loaded?: boolean; start?: number; bars?: number; noPivots?: boolean } = {}): { env: Env; s: ReturnType<typeof shapeOf> } {
  const sell = abSide === 'sell';
  const m = (p: number) => (sell ? p : 200 - p);
  const big: FormationBar[] = BASE.concat([AFTER]).map(([h, l, c], i) => {
    const [hh, ll] = sell ? [h, l] : [m(l), m(h)];
    return { time: T0 + i * STEP, open: m(c), high: hh, low: ll, close: m(c) };
  });
  const s = shapeOf(big, { a: { idx: 1, price: m(100) }, b: { idx: 2, price: m(130) }, c: { idx: 4, price: m(114) } });
  const t0 = o.start ?? LT0;
  const low: FormationBar[] = Array.from({ length: o.bars ?? 16 }, (_, i) => ({ time: t0 + i * H, open: m(120), high: m(121), low: m(119), close: m(120) }));
  const pivots = pv.map((p): Pivot => ({ idx: p.idx, doneAt: p.idx + 2, side: p.top === sell ? 'resistance' : 'support', price: m(p.price), kind: 'correction', len: 1 }));
  const views = new Map<string, unknown>([['H4', { bars: big }]]);
  if (o.loaded !== false) views.set('H1', { bars: low });
  const trends = new Map<string, unknown>();
  if (o.loaded !== false) trends.set('H1', { bars: low, pivots: o.noPivots ? [] : pivots });
  return { env: { views, trends } as unknown as Env, s };
}

for (const abSide of ['sell', 'buy'] as const) {
  const tag = abSide === 'sell' ? 'Satış AB=CD' : 'Alış AB=CD';
  const lowerOf = (pv: Pv[], o?: Parameters<typeof lowerEnv>[2]) => {
    const { env, s } = lowerEnv(abSide, pv, o);
    return lowerAbcdAt(env, 'H4', s);
  };
  const withD = (d: Partial<Pv>, c?: Partial<Pv>): Pv[] => SMALL.map((p, i) => ({ ...p, ...(i === 3 ? d : {}), ...(i === 2 ? c : {}) }));

  frm(`Alt AB=CD (${tag}): dört şart tamam → karşılandı, değer alt zaman diliminin adı`, () => {
    expect(lowerOf(SMALL)).toEqual({ state: 'met', tf: 'H1' });
    // aralık sonrası ek dönüş noktası ve önceki dönüş noktaları sonucu değiştirmez
    const extra: Pv[] = [{ idx: 0, top: false, price: 131 }, ...SMALL, { idx: 14, top: true, price: 125 }];
    expect(lowerOf(extra)).toEqual({ state: 'met', tf: 'H1' });
  });

  frm(`Alt AB=CD (${tag}): küçük a tam B mumunun açılışında → karşılandı`, () => {
    const pv: Pv[] = [{ idx: 1, top: true, price: 128 }, ...SMALL.slice(1)];
    expect(lowerOf(pv).state).toBe('met');
  });

  frm(`Alt AB=CD (${tag}): düzeltme tek bacak, ara dönüş yok → karşılanmadı`, () => {
    const pv: Pv[] = [{ idx: 0, top: true, price: 131 }, { idx: 10, top: false, price: 115.5 }];
    expect(lowerOf(pv).state).toBe('unmet');
    expect(lowerOf([SMALL[0], SMALL[1], SMALL[3]]).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): küçük d seviye 1'e ulaşmadı → karşılanmadı`, () => {
    expect(lowerOf(withD({ price: 118 })).state).toBe('unmet');
    // tolerans içinde (AB'nin %5'i = 0,4): 116,3 sayılır, 116,5 sayılmaz
    expect(lowerOf(withD({ price: 116.3 })).state).toBe('met');
    expect(lowerOf(withD({ price: 116.5 })).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): küçük c 0,382'den sığ → karşılanmadı`, () => {
    // c 122: derinlik 0,25; seviye 1 = 114, d 113,5 ulaşır
    expect(lowerOf(withD({ price: 113.5 }, { price: 122 })).state).toBe('unmet');
    // c 123,1: derinlik 0,3875 ≥ 0,382 → sınırın üstü karşılanır (seviye 1 = 115,1)
    expect(lowerOf(withD({ price: 115 }, { price: 123.1 })).state).toBe('met');
  });

  frm(`Alt AB=CD (${tag}): küçük c üst sınırı aşıyor → karşılanmadı`, () => {
    // c 127: derinlik 0,875 > 0,728; seviye 1 = 119, d 118 ulaşır
    expect(lowerOf(withD({ price: 118 }, { price: 127 })).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): küçük a büyük B'den önce → karşılanmadı`, () => {
    const pv: Pv[] = [{ idx: 0, top: true, price: 128 }, ...SMALL.slice(1)];
    expect(lowerOf(pv).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): küçük d büyük C mumunun aralığı dışında → karşılanmadı`, () => {
    // 1 saatlik idx 9 = C açılışı (içeride), idx 8 = bir mum önce, idx 13 = C mumunun bitişi (dışarıda)
    expect(lowerOf(withD({ idx: 9 })).state).toBe('met');
    expect(lowerOf(withD({ idx: 12 })).state).toBe('met');
    expect(lowerOf(withD({ idx: 8 })).state).toBe('unmet');
    expect(lowerOf(withD({ idx: 13 })).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): yön sırası yanlışsa karşılanmadı`, () => {
    const flipped = SMALL.map((p) => ({ ...p, top: !p.top }));
    expect(lowerOf(flipped).state).toBe('unmet');
  });

  frm(`Alt AB=CD (${tag}): alt zaman dilimi yüklü değil → ölçülemedi`, () => {
    expect(lowerOf(SMALL, { loaded: false })).toEqual({ state: 'unmeasurable' });
  });

  frm(`Alt AB=CD (${tag}): alt zaman diliminde dönüş noktası yok → ölçülemedi`, () => {
    expect(lowerOf(SMALL, { noPivots: true })).toEqual({ state: 'unmeasurable' });
  });

  frm(`Alt AB=CD (${tag}): alt zaman dilimi verisi B'ye kadar uzanmıyor → ölçülemedi`, () => {
    expect(lowerOf(SMALL, { start: LT0 + 2 * H, bars: 14 })).toEqual({ state: 'unmeasurable' });
    // veri tam B mumunun açılışında başlıyorsa yeter
    expect(lowerOf(SMALL.map((p) => ({ ...p, idx: p.idx - 1 })), { start: LT0 + H, bars: 15 }).state).toBe('met');
  });

  frm(`Alt AB=CD (${tag}): satır bonus kalır; giriş, stop, hedef, varyant ve diğer satırlar bağımsız`, () => {
    const base = need(run(abSide, { engulf: [{}] }).cl);
    for (const lower of [lowerOf(SMALL), lowerOf(withD({ price: 118 })), lowerOf(SMALL, { loaded: false })]) {
      const cl = need(run(abSide, { engulf: [{}], lower }).cl);
      expect(row(cl, 'lowerAbcd')).toMatchObject({ kind: 'bonus', state: lower.state });
      if (lower.state === 'met') expect(row(cl, 'lowerAbcd').value).toBe('H1');
      else expect(row(cl, 'lowerAbcd').value).toBeUndefined();
      expect({ ...cl, rows: cl.rows.filter((r) => r.key !== 'lowerAbcd') }).toEqual({ ...base, rows: base.rows.filter((r) => r.key !== 'lowerAbcd') });
    }
    // zorunlu satır eksikken karşılanan satır değer üretmez
    const none = need(run(abSide, { lower: { state: 'met', tf: 'H1' } }).cl);
    expect(none.variant).toBeNull();
    expect(none.entry).toBeNull();
  });
}
