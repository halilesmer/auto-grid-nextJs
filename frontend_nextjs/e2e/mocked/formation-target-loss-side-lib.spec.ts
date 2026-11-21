/**
 * Koşan hedefler (TP1, TP2) hiçbir zaman girişin zarar tarafında durmaz (1121-A11.2).
 *
 * Stop yalnız kapanışla tetiklenir; Not-SL stopun bir ATR ötesindedir. Aradaki derin bir fitil, kapanış stopun berisinde kaldıkça,
 * koşan Ziel-Fib'in ucunu (`from → äußerster Docht`) taşır. Uç girişin 0.618 × (from − Einstieg) ötesine geçince TP1 girişin zarar tarafına düşer.
 *
 * Gerçek vaka 1 (XAUUSD M15, Bat alış): X 4629.28 (2026-04-07 14:00), A 4670.90, B 4646.79, C 4659.99. Giriş = D seviyesi 4634.02,
 * stop 4619.94, Not-SL 4603.79. Giriş mumu (17:00) fitili 4607.91'e iniyor (stopun 12.03 ötesi), 4622.28'de stopun berisinde kapanıyor.
 * Koşan TP1 = Fib(A → 4607.91, 0.382) = 4631.97, girişin 2.05 altında. Canlı taramada (H1, 4 mumda bir) 16 taramada aynı TP1; 1120-A35.1'in
 * koruması bu TP1'i saymadığı ve TP2 TP1'i beklediği için fiyat 4857'ye çıksa da işlem `open` kaldı.
 *
 * Gerçek vaka 2 (XAUUSD H4, AB=CD alış): A 4580.28 (2026-05-26 00:00), B 4500.71, C 4531.20. Giriş Level 1 4451.63, from = C, stop 4421.23,
 * Not-SL 4394.37. 05-27 16:00 mumunun fitili 4401.50 (stopun 19.73 ötesi), kapanış 4450.82. Koşan TP1 = Fib(C → 4401.50) = 4451.05, girişin altında.
 *
 * Karar 1121-A14.1 (Halil, 2026-11-21, "A: Uç stopta durur"): hedef Fib'in ucu en fazla stop; D noktası fitilde kalır. Stopun ötesinde
 * kapanış zaten stoptur. TP1 = stop + 0.382 × (from − stop) = giriş + 0.146 × (from − giriş), her zaman kârda.
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { ABCD_PARAMS, BUT_PARAMS, CRB_PARAMS, DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { analyzeBat, checkBatCandidate } from '../../src/lib/formation/batChecks';
import { checkGarCandidate } from '../../src/lib/formation/garChecks';
import { checkCypCandidate } from '../../src/lib/formation/cypChecks';
import { fibPrice, targetEnd } from '../../src/lib/formation/trade';
import { harmonicTrade } from '../../src/lib/formation/tradeApply';
import { tradeStatusOf } from '../../src/lib/formation/tradeStatus';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { makeRun } from '../fixtures/formation-harmonic';
import { barsOf, END, H4, mirror, plain, zig, type Row } from '../fixtures/formation-rows';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const bars = (rows: [number, number, number, number, number][]): FormationBar[] =>
  rows.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));

/** Koşan hedefler kârda: alışta girişin üstünde, satışta altında; null ise hedef yok */
function expectTargetsOnProfitSide(c: Candidate) {
  const t = c.trade!;
  expect(t.entry, 'işlem girmiş olmalı').not.toBeNull();
  const profit = (p: number) => (c.side === 'buy' ? p - t.entry! : t.entry! - p);
  for (const [name, v] of [['tp1', t.tp1], ['tp2', t.tp2], ['tpBig', t.tpBig]] as const) {
    if (v != null) expect(profit(v), `${name} ${v} girişin (${t.entry}) zarar tarafında`).toBeGreaterThan(0);
  }
}

// XAUUSD M15 [Zeit, Eröffnung, Hoch, Tief, Schluss], 2026-04-07 03:00 – 2026-04-08 00:00
const BAT_M15: [number, number, number, number, number][] = [
  [1775523600, 4650.23, 4667.87, 4650.1, 4663.66],
  [1775524500, 4663.67, 4666.32, 4659.08, 4662.25],
  [1775525400, 4662.25, 4663.09, 4659.08, 4659.13],
  [1775526300, 4659.13, 4662.13, 4656.65, 4658.29],
  [1775527200, 4658.29, 4661.12, 4657.01, 4660.17],
  [1775528100, 4660.17, 4660.82, 4653.31, 4654.49],
  [1775529000, 4654.5, 4656.34, 4651.54, 4655.38],
  [1775529900, 4655.38, 4660.21, 4654.43, 4658.88],
  [1775530800, 4658.88, 4660.49, 4649.16, 4657.66],
  [1775531700, 4657.66, 4661.02, 4656.52, 4659.25],
  [1775532600, 4659.25, 4661.31, 4657.46, 4660.87],
  [1775533500, 4660.82, 4661.49, 4654.79, 4655.2],
  [1775534400, 4655.03, 4664.31, 4627.98, 4641.13],
  [1775535300, 4641.05, 4657.66, 4638.41, 4654.86],
  [1775536200, 4654.65, 4662.2, 4629.21, 4642.03],
  [1775537100, 4642.04, 4647.38, 4616.5, 4627.14],
  [1775538000, 4627.14, 4634.61, 4620.05, 4626.94],
  [1775538900, 4626.92, 4635.33, 4623.15, 4634.87],
  [1775539800, 4634.68, 4646.92, 4633.94, 4646.32],
  [1775540700, 4646.32, 4653.84, 4645.32, 4650.53],
  [1775541600, 4650.5, 4654, 4641.42, 4645.23],
  [1775542500, 4645.26, 4647.94, 4639.91, 4642.84],
  [1775543400, 4642.77, 4648.27, 4642.19, 4648.1],
  [1775544300, 4648.22, 4651.05, 4647.11, 4649.44],
  [1775545200, 4649.42, 4651.03, 4645.66, 4646.25],
  [1775546100, 4646.25, 4650.98, 4645.61, 4650.08],
  [1775547000, 4649.97, 4663.28, 4649.44, 4661.81],
  [1775547900, 4661.81, 4662.98, 4658.92, 4659.35],
  [1775548800, 4660.38, 4661.31, 4654.27, 4655.64],
  [1775549700, 4655.64, 4658.15, 4630.89, 4633.25],
  [1775550600, 4632.55, 4641.71, 4623.48, 4631.75],
  [1775551500, 4631.75, 4646.53, 4629.79, 4642.99],
  [1775552400, 4642.97, 4648.25, 4638.27, 4647.34],
  [1775553300, 4647.54, 4648.99, 4638.12, 4641.3],
  [1775554200, 4641.27, 4653.76, 4641.27, 4652.47],
  [1775555100, 4652.43, 4656.5, 4648.6, 4653.55],
  [1775556000, 4653.74, 4657.06, 4649.16, 4651.56],
  [1775556900, 4651.72, 4653.9, 4638.99, 4639.75],
  [1775557800, 4639.75, 4646.63, 4636.88, 4643.76],
  [1775558700, 4643.88, 4647.2, 4638.82, 4646.1],
  [1775559600, 4646.23, 4665.48, 4644.35, 4663.43],
  [1775560500, 4663.55, 4690.74, 4657.34, 4678.26],
  [1775561400, 4678.38, 4687.53, 4676.6, 4683.16],
  [1775562300, 4683.14, 4687.48, 4679.3, 4683.07],
  [1775563200, 4683.07, 4693.23, 4681.1, 4685.16],
  [1775564100, 4685.46, 4694.31, 4682.85, 4686.92],
  [1775565000, 4686.7, 4686.97, 4666.01, 4667.28],
  [1775565900, 4667.41, 4675.81, 4659.07, 4670.88],
  [1775566800, 4670.79, 4679.9, 4663.26, 4676.73],
  [1775567700, 4676.81, 4680.46, 4658, 4668.12],
  [1775568600, 4668.15, 4672.14, 4655.08, 4662.3],
  [1775569500, 4662.28, 4662.41, 4649.52, 4652.06],
  [1775570400, 4652.01, 4656.34, 4629.28, 4635.79],
  [1775571300, 4635.73, 4652.44, 4633.34, 4648.16],
  [1775572200, 4647.91, 4663.29, 4647.41, 4663.1],
  [1775573100, 4663.1, 4663.72, 4656.12, 4659.81],
  [1775574000, 4659.84, 4664.36, 4651.6, 4655.16],
  [1775574900, 4655.17, 4670.9, 4651.51, 4665.69],
  [1775575800, 4665.78, 4667.35, 4656.24, 4656.89],
  [1775576700, 4656.78, 4662.3, 4646.79, 4651.48],
  [1775577600, 4651.52, 4659.99, 4648.29, 4656.78],
  [1775578500, 4656.78, 4662.86, 4650.55, 4658.23],
  [1775579400, 4658.4, 4663.31, 4635.84, 4639.92],
  [1775580300, 4639.82, 4653.95, 4637.65, 4644.34],
  [1775581200, 4644.33, 4645.25, 4607.91, 4622.28],
  [1775582100, 4622.11, 4649.69, 4610.61, 4645.16],
  [1775583000, 4645.53, 4661.09, 4642.71, 4647.16],
  [1775583900, 4646.99, 4656.68, 4630.21, 4633.43],
  [1775584800, 4633.3, 4643.17, 4625.04, 4643.05],
  [1775585700, 4643.31, 4653.34, 4640.9, 4653.13],
  [1775586600, 4653.12, 4656.71, 4640.64, 4645.62],
  [1775587500, 4645.77, 4659.4, 4645.33, 4655.55],
  [1775588400, 4655.57, 4668.37, 4652.58, 4658.84],
  [1775589300, 4658.9, 4667.24, 4654.51, 4662.99],
  [1775590200, 4662.84, 4664.04, 4656.12, 4660.9],
  [1775591100, 4661.02, 4662.99, 4656.43, 4657.09],
  [1775592000, 4657.09, 4673.28, 4656.65, 4668.14],
  [1775592900, 4668.11, 4668.11, 4653.77, 4660.5],
  [1775593800, 4660.24, 4686.86, 4660.24, 4672.34],
  [1775594700, 4672.32, 4680.15, 4671.24, 4675.87],
  [1775595600, 4675.87, 4684.54, 4675.62, 4684.03],
  [1775596500, 4684.02, 4685.93, 4677.07, 4680.31],
  [1775597400, 4680.33, 4686.12, 4677.26, 4679.67],
  [1775598300, 4679.65, 4679.97, 4657.56, 4662.06],
  [1775599200, 4662.07, 4668.76, 4660.52, 4667.85],
  [1775600100, 4667.86, 4702.74, 4666.91, 4687.46],
  [1775601000, 4687.51, 4691.19, 4681.96, 4687.08],
  [1775601900, 4687.23, 4718.73, 4685.96, 4700.61],
  [1775602800, 4700.85, 4710.89, 4697.4, 4708.65],
  [1775603700, 4708.94, 4712.93, 4704.13, 4710.21],
  [1775604600, 4711.26, 4716.53, 4703.62, 4708.21],
  [1775605500, 4708.6, 4713.72, 4704.92, 4705.56],];

test('Bat alış: girişi geçen derin fitil koşan TP1’i girişin altına çekmez', { tag: '@FRM-07' }, () => {
  const ctx = new FormationContext('XAUUSD', { M15: { bars: bars(BAT_M15), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
  const at = Date.parse('2026-04-08T00:00Z') / 1000;
  const bat = analyzeBat(ctx, at).find((h) => h.tf === 'M15' && h.candidate.side === 'buy' && h.candidate.points.A?.time === 1775574900);
  expect(bat, 'Bat alış adayı (A 2026-04-07 15:15)').toBeDefined();
  const c = bat!.candidate;
  // Ön koşul: vaka canlı taramadaki gibi (giriş, stop, giriş mumunun fitili stopun ötesinde)
  expect(c.trade!.entry).toBeCloseTo(4634.02, 2);
  expect(c.trade!.stop).toBeCloseTo(4619.94, 2);
  expect(c.points.D?.price).toBe(4607.91);
  expectTargetsOnProfitSide(c);
});

// XAUUSD H4 [Zeit, Eröffnung, Hoch, Tief, Schluss], 2026-05-14 04:00 – 2026-05-28 00:00
const ABCD_H4: [number, number, number, number, number][] = [
  [1778731200, 4704.99, 4712.27, 4668.77, 4702.17],
  [1778745600, 4702.26, 4718.75, 4686.15, 4693.3],
  [1778760000, 4693.39, 4710.02, 4688.47, 4704.79],
  [1778774400, 4704.81, 4707.75, 4666.82, 4678.59],
  [1778788800, 4678.67, 4683.11, 4644.4, 4652.37],
  [1778803200, 4653.03, 4665.35, 4613.73, 4630.12],
  [1778817600, 4630.04, 4631.44, 4604.33, 4605.95],
  [1778832000, 4606.27, 4606.62, 4550.07, 4554.18],
  [1778846400, 4554.56, 4572.64, 4532.03, 4545.99],
  [1778860800, 4545.97, 4566.43, 4511.92, 4544.56],
  [1778875200, 4544.35, 4564.38, 4533.17, 4539.71],
  [1779062400, 4539.31, 4554.78, 4480.72, 4515.89],
  [1779076800, 4515.93, 4549.65, 4489.58, 4540.66],
  [1779091200, 4540.82, 4559.95, 4529.9, 4549.95],
  [1779105600, 4549.76, 4574.69, 4530.01, 4571.32],
  [1779120000, 4571.28, 4584.14, 4532, 4550.18],
  [1779134400, 4550.19, 4566.66, 4534.19, 4566.15],
  [1779148800, 4568.14, 4589.36, 4561.53, 4563.51],
  [1779163200, 4563.1, 4572.09, 4538.04, 4542.44],
  [1779177600, 4542.43, 4559.38, 4531.31, 4542.77],
  [1779192000, 4542.78, 4547.97, 4525.61, 4537.27],
  [1779206400, 4537.24, 4537.43, 4464.78, 4507.67],
  [1779220800, 4507.65, 4510.98, 4481.05, 4482.04],
  [1779235200, 4482.88, 4508.81, 4477.51, 4500.98],
  [1779249600, 4500.9, 4506.18, 4453.69, 4462.32],
  [1779264000, 4462.32, 4489.98, 4461.6, 4484.07],
  [1779278400, 4484.08, 4505.3, 4472.82, 4496.24],
  [1779292800, 4496.15, 4552.71, 4467.07, 4534.33],
  [1779307200, 4534.48, 4550.36, 4529.49, 4543.7],
  [1779321600, 4546.88, 4553.26, 4534.63, 4545.14],
  [1779336000, 4545.18, 4570.99, 4527.31, 4538.59],
  [1779350400, 4538.59, 4540.49, 4512.06, 4532.63],
  [1779364800, 4532.52, 4542.7, 4502.6, 4504.15],
  [1779379200, 4504.08, 4520.99, 4488.72, 4519.46],
  [1779393600, 4519.45, 4559.28, 4514.19, 4543.19],
  [1779408000, 4546.41, 4546.41, 4525.62, 4526.73],
  [1779422400, 4526.68, 4536.27, 4518.56, 4527.31],
  [1779436800, 4527.22, 4534.24, 4507.44, 4521.89],
  [1779451200, 4521.84, 4536.83, 4510.23, 4528.32],
  [1779465600, 4528.53, 4534.32, 4491.93, 4515.01],
  [1779480000, 4515.12, 4527.75, 4504.39, 4507.78],
  [1779667200, 4541.65, 4579.98, 4533.79, 4569.45],
  [1779681600, 4569.45, 4576.47, 4556.83, 4564.95],
  [1779696000, 4564.94, 4566.15, 4550.48, 4556.12],
  [1779710400, 4556.09, 4577.02, 4552.93, 4567.73],
  [1779724800, 4567.68, 4574.79, 4560.2, 4573.65],
  [1779739200, 4573.44, 4577.8, 4563.4, 4569.31],
  [1779753600, 4570.65, 4580.28, 4539.47, 4549.6],
  [1779768000, 4549.71, 4550.18, 4523.51, 4525.43],
  [1779782400, 4525.31, 4539.01, 4520.19, 4523.72],
  [1779796800, 4524.37, 4540.53, 4500.71, 4520.43],
  [1779811200, 4520.45, 4531.2, 4499.96, 4504.94],
  [1779825600, 4504.92, 4510.6, 4482.74, 4507.56],
  [1779840000, 4537.84, 4537.84, 4498.25, 4515.22],
  [1779854400, 4515.22, 4521.01, 4495.97, 4510.11],
  [1779868800, 4510.13, 4513.77, 4475.86, 4497.81],
  [1779883200, 4497.83, 4497.83, 4424.89, 4438.94],
  [1779897600, 4438.95, 4455.37, 4401.5, 4450.82],
  [1779912000, 4450.85, 4458.84, 4441.46, 4456.3],
  [1779926400, 4462.14, 4465.92, 4443.85, 4457.3],
];

test('AB=CD alış (XAUUSD H4): stopun ötesine inen kapanışsız fitil koşan TP1’i girişin altına çekmez, TP1 kârda sayılır', { tag: '@FRM-05' }, () => {
  const at = Date.parse('2026-05-28T04:00Z') / 1000;
  const ctx = new FormationContext('XAUUSD', { H4: { bars: bars(ABCD_H4), missing: [] } }, { trend: DEFAULT_TREND_SETTINGS });
  const hit = analyzeAbcd(ctx, at).find((a) => a.tf === 'H4' && a.candidate.side === 'buy' && a.candidate.points.A?.time === 1779753600);
  expect(hit, 'AB=CD alış adayı (A 2026-05-26 00:00)').toBeDefined();
  const c = hit!.candidate;
  const t = c.trade!;
  // Ön koşul: canlı taramadaki işlem; D fitili stopun ötesinde, Not-SL'nin berisinde
  expect(c.points.C?.price).toBe(4531.2);
  expect(t.entry).toBeCloseTo(4451.63, 2);
  expect(t.stop).toBeCloseTo(4421.23, 2);
  expect(c.points.D?.price).toBe(4401.5);
  expect(c.points.D!.price).toBeGreaterThan(t.emergencyStop!);
  expectTargetsOnProfitSide(c);
  expect(t.tp1).toBeCloseTo(fibPrice(4531.2, t.stop!, ABCD_PARAMS.targets.tp1), 6);
  // 05-28 00:00 mumu (yüksek 4465.92) TP1'e değer: işlem artık takılı kalmaz
  expect(t.status).toMatchObject({ kind: 'tp1', tp1Fill: t.tp1 });
  // Çizim Z-ABCD-05 TP1 ile aynı uçta biter, zamanı D'nin
  const fib = c.drawings.find((x) => x.id === 'Z-ABCD-05')!;
  expect(fib.anchors[1]).toEqual({ time: c.points.D!.time, price: t.stop });
});

// ---- Koruma, kurgu mumlar: giriş mumunun fitili stopun ötesine iner, mum stopun berisinde kapanır ----
// Gartley, Bat ve Cypher seviyede girer; giriş mumunda Not-SL sayılmaz (tradeStatus girişten sonraki mumdan başlar). Fitil girişin
// 0.7 × (from − giriş) ötesine iner: eski kuralla TP1 = Fib(from → fitil) girişin zarar tarafına düşerdi (eşik 0.618).
const H_LEGS = [18, 4, 4, 4];
const H_AT = { x: 2, a: 20, b: 24, c: 28 };
const deepEntryRows = (approach: Row[], from: number, entry: number): Row[] => {
  const stop = entry - ABCD_PARAMS.targets.stop * (from - entry);
  const prev = approach[approach.length - 1][3];
  const deep: Row = [prev, prev + 0.5, entry - 0.7 * (from - entry), stop + 1.5];
  return [...approach, deep, [stop + 1.5, stop + 3, stop + 1, stop + 2.5]];
};

for (const hc of [
  { code: 'GAR', check: checkGarCandidate, pts: [100, 130, 111.46, 122.92, 113.5], entry: 111.46 - 0.272 * (130 - 111.46), tag: '@FRM-07' },
  { code: 'BAT', check: checkBatCandidate, pts: [100, 130, 115, 120.8, 106], entry: 130 + 0.886 * (100 - 130), tag: '@FRM-07' },
] as const) {
  for (const buy of [true, false]) {
    test(`${hc.code} ${buy ? 'alış' : 'satış'} (kurgu): giriş mumunun fitili stopun ötesinde, kapanış berisinde; TP1 ve TP2 kârda`, { tag: hc.tag }, () => {
      const rows = deepEntryRows(zig([...hc.pts], H_LEGS, 0), 130, hc.entry);
      const run = makeRun(hc.check as never, H_AT as never);
      const c = run({ H4: buy ? rows : mirror(rows) }, H_AT as never, { buy });
      const mir = (p: number) => (buy ? p : 200 - p);
      const t = c.trade!;
      expect(t.entry).toBeCloseTo(mir(hc.entry), 6);
      // Ön koşul: D (giriş mumunun fitili) eski eşiğin ötesinde, stop kapanışla tetiklenmedi
      expect(c.points.D?.price).toBeCloseTo(mir(hc.entry - 0.7 * (130 - hc.entry)), 6);
      expect(t.status?.kind).toBe('open');
      expectTargetsOnProfitSide(c);
      expect(t.tp1).toBeCloseTo(fibPrice(mir(130), t.stop!, 0.382), 6);
    });
  }
}

// Cypher: X 100, A 130, B 115, C 139; giriş = Fib X → C 0.786 = 108.346, from = C
const CYP_LEGS = [10, 4, 14, 8];
const CYP_PRE = 40;
for (const buy of [true, false]) {
  test(`CYP ${buy ? 'alış' : 'satış'} (kurgu): giriş mumunun fitili stopun ötesinde, kapanış berisinde; TP1 ve TP2 kârda`, { tag: '@FRM-12' }, () => {
    const entry = 139 - 0.786 * (139 - 100);
    const approach = [...Array.from({ length: CYP_PRE }, () => plain(102.2, 102.2)), ...zig([100, 130, 115, 139, 111], CYP_LEGS, 0)];
    const rows = deepEntryRows(approach, 139, entry);
    const input = buy ? rows : mirror(rows);
    const x = CYP_PRE + 2;
    const a = x + CYP_LEGS[0];
    const b = a + CYP_LEGS[1];
    const cIdx = b + CYP_LEGS[2];
    const dIdx = rows.length - 2;
    const pt = (idx: number, high: boolean) => ({ time: idx * H4, price: high ? input[idx][1] : input[idx][2] });
    const ctx = new FormationContext('TEST', { H4: barsOf(input, H4) }, { trend: FIXTURE_TREND });
    const c = checkCypCandidate(ctx, END, { tf: 'H4', x: pt(x, !buy), a: pt(a, buy), b: pt(b, !buy), c: pt(cIdx, buy), d: pt(dIdx, !buy) });
    const mir = (p: number) => (buy ? p : 200 - p);
    const t = c.trade!;
    expect(t.entry).toBeCloseTo(mir(entry), 6);
    expect(c.points.D?.price).toBeCloseTo(mir(entry - 0.7 * (139 - entry)), 6);
    expect(t.status?.kind).toBe('open');
    expectTargetsOnProfitSide(c);
    expect(t.tp1).toBeCloseTo(fibPrice(mir(139), t.stop!, 0.382), 6);
    const fib = c.drawings.find((z) => z.id === 'Z-CYP-03')!;
    expect(fib.anchors[1].price).toBeCloseTo(t.stop!, 6);
  });
}

// Butterfly ve Crab dochtta girer (giriş = dokunma mumunun fitili): stopun ötesine ancak sonraki bir mum iner ve orada Not-SL
// (stop − ATR) sayılır. Kurgu mumlarda ATR küçük olduğu için bu yol yalnız ATR > 0.236 × (A − giriş) iken açıktır; burada hesap
// Not-SL'siz (emergencyStop null) doğrudan `harmonicTrade` ve `tradeStatusOf` ile sınanır.
for (const hc of [
  { code: 'BUT', targets: BUT_PARAMS.targets, touchEnd: 91.8 },
  { code: 'CRB', targets: CRB_PARAMS.targets, touchEnd: 81.4 },
] as const) {
  for (const buy of [true, false]) {
    test(`${hc.code} ${buy ? 'alış' : 'satış'}: girişten sonra stopun ötesine inen kapanışsız fitil TP1’i girişin zarar tarafına çekmez`, { tag: '@FRM-39' }, () => {
      const mir = (p: number) => (buy ? p : 200 - p);
      const from = 130;
      const entry = hc.touchEnd;
      const deep = entry - 0.7 * (from - entry);
      const freeze = { idx: 0, touchEnd: mir(entry) };
      const t = harmonicTrade({ price: mir(from) }, { price: mir(deep) }, true, hc.targets, `${hc.code}-07`, freeze);
      const profit = (p: number) => (buy ? p - t.entry! : t.entry! - p);
      expect(t.entry).toBeCloseTo(mir(entry), 9);
      expect(profit(t.tp1!)).toBeGreaterThan(0);
      expect(profit(t.tp2!)).toBeGreaterThan(0);
      expect(t.tp1).toBeCloseTo(fibPrice(mir(from), targetEnd(mir(from), mir(deep), t.stop), hc.targets.tp1), 9);
      // Durum: giriş mumu, derin fitil (kapanış stopun berisinde), sonra TP1'e değen mum
      const stop = entry - hc.targets.stop * (from - entry);
      const tp1 = stop + hc.targets.tp1 * (from - stop);
      const rows: Row[] = [
        [entry + 1, entry + 2, entry, entry + 1],
        [entry + 1, entry + 1.5, deep, stop + 1],
        [stop + 1, tp1 + 0.5, stop + 0.5, tp1 + 0.2],
      ];
      const fb: FormationBar[] = (buy ? rows : mirror(rows)).map(([open, high, low, close], i) => ({ time: i * H4, open, high, low, close }));
      const st = tradeStatusOf({ bars: fb, entryIdx: 0, side: buy ? 'buy' : 'sell', entry: t.entry!, stop: t.stop!, emergencyStop: null, from: mir(from), targets: hc.targets });
      expect(st.kind).toBe('tp1');
      expect(profit(st.tp1Fill!)).toBeGreaterThan(0);
      expect(st.tp1Fill).toBeCloseTo(mir(tp1), 9);
    });
  }
}
