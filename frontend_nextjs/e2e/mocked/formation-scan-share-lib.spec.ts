/**
 * Die Suche teilt die Umgebung (buildEnv) zwischen den Formationen (Befund 49): je Kontext, Zeitpunkt und Zeiteinheit wird sie einmal gebaut.
 * Das Ergebnis bleibt gleich: die Suche liefert Feld für Feld dasselbe wie jede Formation allein auf frischem Kontext (ungeteilter Weg),
 * auch im zweiten Durchlauf im selben Bereich (kein Analyzer verändert eine geteilte Umgebung).
 * FRM-18 Suche der Seite /formasyon
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { TIMEFRAME_SEC } from '../../src/lib/analysis/candles';
import { analyze2618 } from '../../src/lib/formation/f2618Checks';
import { analyzeAbcd } from '../../src/lib/formation/abcdChecks';
import { analyzeBat } from '../../src/lib/formation/batChecks';
import { analyzeBut } from '../../src/lib/formation/butChecks';
import { analyzeCdt } from '../../src/lib/formation/cdtChecks';
import { analyzeCrb } from '../../src/lib/formation/crbChecks';
import { analyzeCyp } from '../../src/lib/formation/cypChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import { analyzeLib } from '../../src/lib/formation/libChecks';
import { analyzeObo } from '../../src/lib/formation/oboChecks';
import { analyzeTdf } from '../../src/lib/formation/tdfChecks';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { buildEnv, shareEnv } from '../../src/lib/formation/reasons';
import { ANALYZERS, SCAN_FORMATIONS, scanFormations, type ScanFormation, type ScanHit } from '../../src/lib/formation/scan';
import { weeklyFromDaily } from '../../src/lib/formation/weekly';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { END as SERIES_END, H4 as H4_SEC, barsOf as rowsToBars, plain, zig, type Row } from '../fixtures/formation-rows';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-18' }, fn);

type Analysis = { tf: string; candidate: Candidate };
type Alone = (ctx: FormationContext, t: number, done: Partial<Record<ScanFormation, Analysis[]>>) => Analysis[];
const candidates = (...lists: (Analysis[] | undefined)[]) => lists.flatMap((l) => (l ?? []).map((a) => a.candidate));

/** Jede Formation allein, wie vor dem Teilen; Libra bekommt Gartley/Bat/Cypher wie in der Suche */
const ALONE: Record<ScanFormation, Alone> = {
  ABCD: (c, t) => analyzeAbcd(c, t),
  GAR: (c, t) => analyzeGar(c, t),
  BAT: (c, t) => analyzeBat(c, t),
  BUT: (c, t) => analyzeBut(c, t),
  CRB: (c, t) => analyzeCrb(c, t),
  CYP: (c, t, done) => analyzeCyp(c, t, candidates(done.GAR, done.BAT)),
  CDT: (c, t) => analyzeCdt(c, t),
  LIB: (c, t, done) => analyzeLib(c, t, { harmonics: candidates(done.GAR, done.BAT), cyphers: candidates(done.CYP) }),
  OBO: (c, t) => analyzeObo(c, t),
  TDF: (c, t) => analyzeTdf(c, t),
  '2618': (c, t) => analyze2618(c, t),
};

/** Ungeteilter Weg: jede Formation auf einem eigenen, frischen Kontext; nur Kandidaten mit Punkten, in der Reihenfolge der Suche */
function aloneHits(make: () => FormationContext, t: number): ScanHit[] {
  const done: Partial<Record<ScanFormation, Analysis[]>> = {};
  const hits: ScanHit[] = [];
  for (const form of SCAN_FORMATIONS) {
    done[form] = ALONE[form](make(), t, done);
    for (const { tf, candidate } of done[form]!) {
      if (Object.keys(candidate.points).length > 0) hits.push({ form, tf, candidate } as ScanHit);
    }
  }
  return hits;
}

function expectSameAsAlone(make: () => FormationContext, t: number) {
  const alone = aloneHits(make, t);
  const scanned = scanFormations(make(), t);
  // zweiter Durchlauf im selben Bereich: nutzt die Umgebungen des ersten weiter
  const ctx = make();
  const [first, second] = shareEnv(ctx, () => [scanFormations(ctx, t), scanFormations(ctx, t)]);
  expect(scanned.length).toBeGreaterThan(0);
  expect(scanned).toEqual(alone);
  expect(first).toEqual(alone);
  expect(second).toEqual(alone);
}

frm('innerhalb von shareEnv liefert buildEnv für gleichen Kontext, Zeitpunkt und Zeiteinheit dasselbe Objekt', () => {
  const fx = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/gar-sell-h4-01.json', 'utf-8')));
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars });
  const other = new FormationContext(fx.symbol, { H4: fx.bars });
  const t = fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC.H4;
  shareEnv(ctx, () => {
    const a = buildEnv(ctx, t, 'H4');
    expect(a).not.toBeNull();
    expect(buildEnv(ctx, t, 'H4')).toBe(a);
    // im selben Bereich neu gebaut: anderer Zeitpunkt, Zonen-Optionen, anderer Kontext
    expect(buildEnv(ctx, t - TIMEFRAME_SEC.H4, 'H4')).not.toBe(a);
    expect(buildEnv(ctx, t, 'H4', { entryTf: 'H4' })).not.toBe(a);
    expect(buildEnv(other, t, 'H4')).not.toBe(a);
  });
  // außerhalb des Bereichs wie bisher neu gebaut
  expect(buildEnv(ctx, t, 'H4')).not.toBe(buildEnv(ctx, t, 'H4'));
});

const FX = 'e2e/fixtures/formation';
for (const file of readdirSync(FX).filter((f) => f.endsWith('.json')).sort()) {
  frm(`Suche mit geteilter Umgebung = jede Formation allein: ${file}`, () => {
    const fx = parseFixture(JSON.parse(readFileSync(`${FX}/${file}`, 'utf-8')));
    const t = fx.bars[fx.bars.length - 1].time + TIMEFRAME_SEC[fx.timeframe];
    expectSameAsAlone(() => new FormationContext(fx.symbol, { [fx.timeframe]: fx.bars }), t);
  });
}

/** Kursschritte (relativ zum vorigen Schluss) aller Fixtures, zu einer Reihe verkettet und neu getaktet (Mo–Fr) */
const steps = readdirSync(FX)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => {
    const bars = parseFixture(JSON.parse(readFileSync(`${FX}/${f}`, 'utf-8'))).bars;
    return bars.slice(1).map((b, i) => {
      const pc = bars[i].close;
      return { o: b.open / pc, h: b.high / pc, l: b.low / pc, c: b.close / pc };
    });
  });

function retimed(offset: number, tfSec: number, days: number, end: number): FormationBar[] {
  const times: number[] = [];
  for (let t = end - days * 86400; t < end; t += tfSec) {
    const wd = new Date(t * 1000).getUTCDay();
    if (wd !== 0 && wd !== 6) times.push(t);
  }
  let pc = 100;
  return times.map((time, i) => {
    const s = steps[(offset + i) % steps.length];
    const bar = { time, open: pc * s.o, high: pc * s.h, low: pc * s.l, close: pc * s.c };
    pc = bar.close;
    return bar;
  });
}

const END = Date.UTC(2026, 9, 28, 12) / 1000;
function pageInput(offset: number): ContextInput {
  const daily = retimed(offset, 86400, 1100, END);
  return {
    D1: daily.filter((b) => b.time >= END - 400 * 86400),
    W1: weeklyFromDaily(daily),
    H4: retimed(offset + 1000, 14400, 120, END),
    H1: retimed(offset + 2000, 3600, 40, END),
    M15: retimed(offset + 3000, 900, 10, END),
  };
}

for (const offset of [0, 5000]) {
  frm(`Suche mit geteilter Umgebung = jede Formation allein: vier Zeiteinheiten in Seitengröße mit W1 (Versatz ${offset})`, () => {
    const input = pageInput(offset);
    expectSameAsAlone(() => new FormationContext('X', input), END);
  });
}

frm('die Suche teilt die Umgebung selbst: ohne äußeren Bereich so wenige Kerzenansichten wie mit', () => {
  const input = pageInput(0);
  const viewCalls = (outerScope: boolean): number => {
    const ctx = new FormationContext('X', input);
    const view = ctx.view.bind(ctx);
    let calls = 0;
    ctx.view = (tf, t) => {
      calls++;
      return view(tf, t);
    };
    if (outerScope) shareEnv(ctx, () => scanFormations(ctx, END));
    else scanFormations(ctx, END);
    return calls;
  };
  expect(viewCalls(false)).toBe(viewCalls(true));
});

// ---- Weitergabe der Ergebnisse an die Libra (LIB-09, LIB-10, CYP-10) --------------------------------------------

/** 40 ruhige Kerzen, dann Verkaufs-Libra: P1 in 22 Kerzen erreicht, P2 in 14 (Divergenz, SIG-13); P1 Index 50, P2 72, P3 76 */
const LEAD: Row[] = Array.from({ length: 40 }, () => plain(100, 100));
const LIBRA_ROWS = [...LEAD, ...zig([100, 130, 112, 140, 105, 131], [8, 8, 14, 4, 8], 3)];
const libraCtx = () => new FormationContext('TEST', { H4: rowsToBars(LIBRA_ROWS, H4_SEC) });

/** Gartley (Kauf) mit D auf P3 (Index 76) und A weit darüber: beide Ziele sind bis zur Berührung erreicht */
const harmonicAtP3: Candidate = {
  code: 'GAR',
  side: 'buy',
  tf: 'H4',
  points: { A: { time: 0, price: 135 }, D: { time: 76 * H4_SEC, price: LIBRA_ROWS[76][2] } },
  checks: [],
  drawings: [],
  verdict: 'valid',
};
/** Cypher (Verkauf), dessen Einstieg 0.786 der Fib X → C bei 129.8 liegt: C 100, X = 100 + 29.8 / 0.786 */
const cypherAtEntry: Candidate = {
  code: 'CYP',
  side: 'sell',
  tf: 'H4',
  points: { X: { time: 0, price: 100 + 29.8 / 0.786 }, C: { time: 1, price: 100 } },
  checks: [],
  drawings: [],
  verdict: 'valid',
};

/** Ergebnisse eines Suchlaufs, von Hand eingespritzt */
const resultsOf =
  (given: Partial<Record<ScanFormation, Candidate[]>>) =>
  (form: ScanFormation) =>
    (given[form] ?? []).map((candidate) => ({ tf: 'H4' as const, candidate }));

const stateOf = (c: Candidate, id: string) => c.checks.find((k) => k.id === id)?.state;

frm('die Suche gibt Gartley und Bat an LIB-10 weiter', () => {
  const lib = (given: Partial<Record<ScanFormation, Candidate[]>>) => ANALYZERS.LIB(libraCtx(), SERIES_END, resultsOf(given))[0].candidate;
  expect(stateOf(lib({}), 'LIB-10')).toBe('unmet');
  expect(stateOf(lib({ GAR: [harmonicAtP3] }), 'LIB-10')).toBe('met');
  expect(stateOf(lib({ BAT: [{ ...harmonicAtP3, code: 'BAT' }] }), 'LIB-10')).toBe('met');
});

frm('die Suche gibt die Cypher an LIB-09 weiter', () => {
  const lib = (given: Partial<Record<ScanFormation, Candidate[]>>) => ANALYZERS.LIB(libraCtx(), SERIES_END, resultsOf(given))[0].candidate;
  expect(stateOf(lib({}), 'LIB-09')).toBe('unmeasurable');
  expect(stateOf(lib({ CYP: [cypherAtEntry] }), 'LIB-09')).toBe('met');
});

frm('die Cypher rechnet Gartley und Bat nicht neu, wenn die Suche sie schon hat', () => {
  const viewCalls = (run: (ctx: FormationContext) => unknown): number => {
    const ctx = libraCtx();
    const view = ctx.view.bind(ctx);
    let calls = 0;
    ctx.view = (tf, t) => {
      calls++;
      return view(tf, t);
    };
    run(ctx);
    return calls;
  };
  const alone = viewCalls((ctx) => analyzeCyp(ctx, SERIES_END));
  expect(viewCalls((ctx) => analyzeCyp(ctx, SERIES_END, [harmonicAtP3]))).toBeLessThan(alone);
  // die Verdrahtung der Suche: ANALYZERS.CYP nimmt Gartley und Bat aus den Ergebnissen des Laufs
  expect(viewCalls((ctx) => ANALYZERS.CYP(ctx, SERIES_END, resultsOf({ GAR: [harmonicAtP3] })))).toBeLessThan(alone);
});
