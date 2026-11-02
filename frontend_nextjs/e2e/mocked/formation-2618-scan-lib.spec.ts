/**
 * 2618 in der Suche der Seite /formasyon: die Suche liefert dieselben Zustände wie `analyze2618` allein, das Badge zählt einen Treffer
 * im Aufbau erst mit I (und nicht, solange an I das Fraktal fehlt), Urteil mit settle und invalidBy, Status der Regeln laut Regelbuch.
 * FRM-08 Formationserkennung: 2618 · FRM-18 Zählung
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { analyze2618, F2618_CHECK_IDS } from '../../src/lib/formation/f2618Checks';
import { parseFixture } from '../../src/lib/formation/fixture';
import { countsAsHit, FINAL_POINT, PENULTIMATE_POINT, SCAN_FORMATIONS, scanFormations, type ScanHit } from '../../src/lib/formation/scan';
import type { Candidate } from '../../src/lib/formation/types';
import { H4 } from '../fixtures/formation-rows';

const frm = (name: string, fn: () => void) => test(name, { tag: ['@FRM-08', '@FRM-18'] }, fn);
const load = (file: string) => parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}.json`, 'utf-8')));
const run = (file: string, t: number) => {
  const fx = load(file);
  const bars = fx.bars.filter((b) => b.time + H4 <= t);
  return { fx, bars, ctx: () => new FormationContext(fx.symbol, { H4: bars }) };
};

const REAL = [
  { file: 'f2618-sell-h4-01', t: 1759737600 },
  { file: 'f2618-sell-h4-02', t: 1761811200 },
  { file: 'f2618-sell-h4-03', t: 1760385600 },
  { file: 'f2618-buy-h4-01', t: 1762747200 },
  { file: 'f2618-vol-h4-01', t: 1764374400 },
  { file: 'f2618-open-h4-01', t: 1761177600 },
];

for (const r of REAL) {
  frm(`Suche liefert für ${r.file} dieselben Zustände wie analyze2618 allein`, () => {
    const { ctx } = run(r.file, r.t);
    const alone = analyze2618(ctx(), r.t)
      .filter((a) => Object.keys(a.candidate.points).length > 0)
      .map((a) => ({ tf: a.tf, candidate: a.candidate }));
    const found = scanFormations(ctx(), r.t)
      .filter((h) => h.form === '2618')
      .map((h) => ({ tf: h.tf, candidate: h.candidate }));
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(alone);
  });
}

frm('2618 steht in der Leiste, der letzte Punkt ist K (Berührung), der vorletzte I', () => {
  expect(SCAN_FORMATIONS).toContain('2618');
  expect(FINAL_POINT['2618']).toBe('K');
  expect(PENULTIMATE_POINT['2618'].points).toEqual(['I']);
});

const at = (i: number) => ({ time: 1000 + i * 100, price: 10 + i });
const hit = (names: string[], verdict: Candidate['verdict'], unfinished = false): ScanHit => ({
  form: '2618',
  tf: 'H4',
  candidate: {
    code: '2618',
    side: 'sell',
    tf: 'H4',
    points: Object.fromEntries(names.map((n, i) => [n, at(i)])),
    checks: [{ id: '2618-03', kind: 'required', status: 'confirmed', state: unfinished ? 'unmet' : 'met', drawings: [] }],
    drawings: [],
    verdict,
  },
});

frm('Badge: im Aufbau zählt erst I mit fertigem Fraktal', () => {
  expect(countsAsHit(hit(['H1', 'N', 'H2'], 'forming'))).toBe(false); // ohne I
  expect(countsAsHit(hit(['H1', 'N', 'H2', 'I'], 'forming', true))).toBe(false); // I ohne fertiges Fraktal
  expect(countsAsHit(hit(['H1', 'N', 'H2', 'I'], 'forming'))).toBe(true);
  expect(countsAsHit(hit(['H1', 'N', 'H2', 'I', 'K'], 'valid'))).toBe(true);
  expect(countsAsHit(hit(['H1', 'N', 'H2', 'I', 'K'], 'invalid'))).toBe(false);
});

frm('Badge auf echter Reihe: I ohne fertiges Fraktal zählt nicht, mit Fraktal und Berührung zählt es', () => {
  const count = (t: number) => scanFormations(run('f2618-open-h4-01', t).ctx(), t).filter((h) => h.form === '2618' && countsAsHit(h)).length;
  const before = scanFormations(run('f2618-open-h4-01', 1760544000).ctx(), 1760544000).find((h) => h.form === '2618')!;
  expect(before.candidate.verdict).toBe('forming');
  expect('I' in before.candidate.points).toBe(true);
  expect(count(1760544000)).toBe(0);
  expect(count(1760558400)).toBe(1);
});

frm('Status laut Regelbuch: 2618-04, -07, -09 und -10 sind bestätigt', () => {
  const { ctx } = run('f2618-sell-h4-01', 1759737600);
  const c = analyze2618(ctx(), 1759737600)[0].candidate;
  expect(c.checks.map((k) => k.id)).toEqual([...F2618_CHECK_IDS]);
  expect(c.checks.filter((k) => k.status !== 'confirmed').map((k) => k.id)).toEqual([]);
});

frm('Urteil: eine nicht messbare Pflicht (2618-01) hält „gültig“ zurück (settle)', () => {
  const t = 1762156800;
  const fx = JSON.parse(readFileSync('e2e/fixtures/formation/cyp-bad-h4-01.json', 'utf-8'));
  const bars = parseFixture(fx).bars.slice(0, 30);
  const c = analyze2618(new FormationContext('TEST', { H4: bars }), t)[0].candidate;
  // Alles andere spricht für „gültig“: Berührung K da, die übrigen Pflichten ☑, kein Ausschluss
  expect('K' in c.points).toBe(true);
  expect(c.checks.filter((k) => k.kind === 'required' && k.state !== 'met').map((k) => k.id)).toEqual(['2618-01']);
  expect(c.checks.find((k) => k.id === '2618-01')!.state).toBe('unmeasurable');
  expect(c.invalidBy).toEqual([]);
  expect(c.verdict).toBe('forming');
});

frm('Urteil: invalidBy nennt nur die Regeln, die „ungültig“ auslösen', () => {
  const by = (file: string, t: number) => analyze2618(run(file, t).ctx(), t)[0].candidate;
  expect(by('f2618-vol-h4-01', 1764374400).invalidBy).toEqual(['2618-10']);
  expect(by('f2618-sell-h4-01', 1759737600).invalidBy).toEqual([]);
  expect(by('f2618-open-h4-01', 1761177600).invalidBy).toEqual([]);
});
