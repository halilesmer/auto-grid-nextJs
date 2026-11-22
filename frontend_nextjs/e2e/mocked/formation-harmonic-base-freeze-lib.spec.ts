/**
 * Harmoniken: Basis und Einstieg frieren am Schluss der Einstiegskerze ein (Prinzip „geçmiş geçmiş kalır“, 1122-A28.1, 1122-A29.2;
 * dazu 1121-A2.1 „C friert am Einstieg ein“, 1122-A3.2 „beim Einstieg nicht gezeigt = nie gezeigt“, 1122-A3.4.1 Handels-Identität
 * Seite + Einstiegskerze + Einstieg).
 *
 * Befund (Mum-mum-Abtastung aller 110 Formations-Fixtures, 120-Tage-Fenster, 2026-11-22): 77 gezeigte, laufende Handel verschwinden.
 * Ursache: der Trendzug zeichnet Wendepunkte VOR dem Einstieg später um (ein Extrem jenseits von B oder X verschmilzt B und C zu einem Zug,
 * der letzte Wendepunkt wandert auf ein späteres Extrem). Die Suche bildet die Basen aus den Wendepunkten der jeweiligen Zeit
 * (`allBases(pivots)`), also fehlt die Basis des laufenden Handels oder sie wird mit anderen Punkten neu gemessen.
 *
 * Fälle (echte Kerzen aus den Fixtures, Trendzug der Fixture):
 * 1. cdt-top-h4-02, Gartley Verkauf: X 11-06 12:00, A 11-06 16:00, B 11-07 00:00, C 11-07 04:00, Einstieg 201.494 in der Kerze 11-07 16:00,
 *    zum Schluss 11-07 20:00 gezeigt (offen). Um 11-08 00:00 ersetzt der Trend den Wendepunkt C 11-07 04:00 durch 11-07 12:00; der Handel fehlt.
 * 2. bat-sell-h4-01, Crab Verkauf: X 12-03 12:00, A 12-05 08:00, B 12-05 16:00, C 12-08 04:00, Einstieg 182.635 in der Kerze 12-09 16:00,
 *    zum Schluss 12-09 20:00 gezeigt (offen). Um 12-10 04:00 streicht der Trend B und C (Hoch 12-09 16:00 über B); der Handel fehlt.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeGar, checkGarCandidate } from '../../src/lib/formation/garChecks';
import { analyzeCrb, checkCrbCandidate } from '../../src/lib/formation/crbChecks';
import type { Anchor, Candidate, FormationBar } from '../../src/lib/formation/types';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: ['@FRM-07', '@FRM-39'] }, fn);

const H4 = 14400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);

type Analyze = (ctx: FormationContext, t: number) => { tf: string; candidate: Candidate }[];
type Check = (ctx: FormationContext, t: number, input: { tf: 'H4'; x: Anchor; a: Anchor; b: Anchor; c: Anchor }) => Candidate;

function load(name: string): { bars: FormationBar[]; ctx: () => FormationContext } {
  const path = `e2e/fixtures/formation/${name}.json`;
  const fx = named(path, parseFixture(JSON.parse(readFileSync(path, 'utf-8'))));
  return { bars: fx.bars, ctx: () => new FormationContext(fx.symbol, { H4: fx.bars }, { trend: trendOf(fx.bars) }) };
}

const entered = (c: Candidate) => c.trade?.entry != null && c.trade.status !== undefined && c.trade.entryIdx !== undefined;
/** Was die Suche vom Handel zeigt: Seite, X, A, B, C (Zeit und Preis), Einstiegskerze, Einstieg, Stop */
const frozenView = (c: Candidate, bars: readonly FormationBar[]) => ({
  side: c.side,
  points: (['X', 'A', 'B', 'C'] as const).map((k) => (c.points[k] ? `${iso(c.points[k]!.time)}@${c.points[k]!.price}` : null)),
  entryBar: c.trade?.entryIdx !== undefined ? iso(bars[c.trade.entryIdx].time) : null,
  entry: c.trade?.entry ?? null,
  stop: c.trade?.stop ?? null,
});

/**
 * Kerze für Kerze von `fromIso` bis `toIso` (ein Kontext, wie die Seite beim Weiterlaufen): jeder Handel, der zum Schluss seiner
 * Einstiegskerze gezeigt wird, bleibt mit denselben Punkten, derselben Einstiegskerze, demselben Einstieg und Stop gezeigt, bis er endet.
 * Ob er geendet hat, misst `check` mit den eingefrorenen Punkten. Gibt die Verstöße zurück.
 */
function unfrozen(analyze: Analyze, check: Check, name: string, fromIso: string, toIso: string): string[] {
  const { bars, ctx: make } = load(name);
  const ctx = make();
  const out: string[] = [];
  let held: { c: Candidate; view: string } | null = null;
  for (const bar of bars) {
    const t = bar.time + H4;
    if (t < at(fromIso) || t > at(toIso)) continue;
    const c = analyze(ctx, t).find((a) => a.tf === 'H4')!.candidate;
    if (held) {
      const p = held.c.points;
      const own = check(ctx, t, { tf: 'H4', x: p.X!, a: p.A, b: p.B, c: p.C });
      const last = bars.findIndex((b) => b.time + H4 === t);
      const ended = own.trade?.status?.endIdx !== undefined && own.trade.status.endIdx < last;
      if (ended) held = null;
      else if (JSON.stringify(frozenView(c, bars)) !== held.view) out.push(`${iso(t)}: ${held.view} -> ${JSON.stringify(frozenView(c, bars))}`);
    }
    if (!held && entered(c) && bars[c.trade!.entryIdx!].time + H4 === t) held = { c, view: JSON.stringify(frozenView(c, bars)) };
  }
  return out;
}

test.describe('Harmonik: Basis und Einstieg frieren am Einstieg ein (1122-A28.1)', () => {
  frm('Gartley Verkauf (cdt-top-h4-02, Einstieg 11-07 16:00): C-Wendepunkt wandert nach dem Einstieg, der Handel bleibt mit seinen Punkten', () => {
    const { ctx } = load('cdt-top-h4-02');
    const c = ctx();
    const shown = (s: string) => analyzeGar(c, at(s)).find((a) => a.tf === 'H4')!.candidate;
    // Vorbedingung: zum Schluss der Einstiegskerze gezeigt, offen
    const atEntry = shown('2025-11-07T20:00');
    expect(atEntry.side).toBe('sell');
    expect(atEntry.points.C?.time).toBe(at('2025-11-07T04:00'));
    expect(atEntry.trade?.entry).toBeCloseTo(201.494, 3);
    expect(atEntry.trade?.status).toMatchObject({ kind: 'open' });
    // nach der Wendepunkt-Verschiebung: derselbe Handel, dieselben Punkte
    const later = shown('2025-11-08T00:00');
    expect(frozenView(later, load('cdt-top-h4-02').bars)).toEqual(frozenView(atEntry, load('cdt-top-h4-02').bars));
  });

  frm('Crab Verkauf (bat-sell-h4-01, Einstieg 12-09 16:00): B und C fallen nach dem Einstieg aus dem Trendzug, der Handel bleibt mit seinen Punkten', () => {
    const { ctx, bars } = load('bat-sell-h4-01');
    const c = ctx();
    const shown = (s: string) => analyzeCrb(c, at(s)).find((a) => a.tf === 'H4')!.candidate;
    const atEntry = shown('2025-12-09T20:00');
    expect(atEntry.side).toBe('sell');
    expect(atEntry.points.B?.time).toBe(at('2025-12-05T16:00'));
    expect(atEntry.trade?.entry).toBeCloseTo(182.635, 3);
    expect(atEntry.trade?.status).toMatchObject({ kind: 'open' });
    const later = shown('2025-12-10T04:00');
    expect(frozenView(later, bars)).toEqual(frozenView(atEntry, bars));
  });

  frm('Ohne Blick in die Zukunft: ein frischer Kontext zeigt nach der Verschiebung dasselbe wie der Lauf Kerze für Kerze', () => {
    for (const [name, analyze, from, t] of [
      ['cdt-top-h4-02', analyzeGar, '2025-11-01T00:00', '2025-11-08T00:00'],
      ['bat-sell-h4-01', analyzeCrb, '2025-12-03T00:00', '2025-12-10T04:00'],
    ] as const) {
      const { ctx, bars } = load(name);
      const seq = ctx();
      for (const bar of bars) if (bar.time + H4 >= at(from) && bar.time + H4 < at(t)) analyze(seq, bar.time + H4);
      const a = analyze(seq, at(t)).find((x) => x.tf === 'H4')!.candidate;
      const b = analyze(ctx(), at(t)).find((x) => x.tf === 'H4')!.candidate;
      expect(frozenView(b, bars), `${name} ${t}`).toEqual(frozenView(a, bars));
    }
  });

  frm('Kerze für Kerze: Gartley cdt-top-h4-02 und Crab bat-sell-h4-01 halten jeden beim Einstieg gezeigten Handel bis zu seinem Ende', () => {
    expect(unfrozen(analyzeGar, checkGarCandidate, 'cdt-top-h4-02', '2025-10-20T00:00', '2025-11-20T00:00')).toEqual([]);
    expect(unfrozen(analyzeCrb, checkCrbCandidate, 'bat-sell-h4-01', '2025-11-25T00:00', '2025-12-20T00:00')).toEqual([]);
  });
});
