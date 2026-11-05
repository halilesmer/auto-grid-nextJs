/**
 * Urteil und nicht messbare Pflicht (C-6): ein Treffer ist nur „gültig“, wenn keine Pflicht nicht messbar ist, die das Urteil blockiert.
 * Je Prüfer ein Fall mit einer nicht messbaren Pflicht (sonst gültig → im Aufbau) und einer ohne Unbekannte (bleibt gültig).
 * Keine Ausnahme für CYP-02 auf D1: W1 aus D1 ist die höhere Zeiteinheit (Befund 16, Variante A).
 * FRM-19 Liste und Checkliste
 */
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { analyzeCyp } from '../../src/lib/formation/cypChecks';
import { blockingUnknowns, exemptFor, settle } from '../../src/lib/formation/settle';
import type { Check, CheckState, RuleKind, Verdict } from '../../src/lib/formation/types';
import { CONTEXT_TIMEFRAMES } from '../../src/lib/formation/params';
import { D1, END, H4, barsOf, mirror, plain, zig } from '../fixtures/formation-rows';
import { FIXTURE_TREND } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-19' }, fn);
const mk = (id: string, state: CheckState, kind: RuleKind = 'required', extra: Partial<Check> = {}): Check => ({ id, kind, status: 'confirmed', state, drawings: [], ...extra });
const U: CheckState = 'unmeasurable';
const M: CheckState = 'met';

const CODES = ['ABCD', 'GAR', 'BAT', 'BUT', 'CRB', 'CYP', 'CDT'] as const;
/** Pflicht, die in keinem Prüfer ausgenommen ist */
const BLOCKING: Record<(typeof CODES)[number], string> = { ABCD: 'ABCD-01', GAR: 'GAR-01', BAT: 'BAT-02', BUT: 'BUT-01', CRB: 'CRB-01', CYP: 'CYP-01', CDT: 'CDT-12' };

test.describe('settle: gültig nur ohne blockierende unbekannte Pflicht', () => {
  for (const code of CODES) {
    const id = BLOCKING[code];
    frm(`${code}: Pflicht ${id} nicht messbar, sonst gültig → im Aufbau`, () => {
      const checks = [mk(`${code}-90`, M), mk(id, U), mk(`${code}-91`, U, 'bonus')];
      expect(settle('valid', checks, exemptFor(code, checks))).toBe('forming');
      expect(blockingUnknowns(checks, exemptFor(code, checks))).toEqual([id]);
    });
    frm(`${code}: ohne Unbekannte bleibt gültig`, () => {
      const checks = [mk(`${code}-90`, M), mk(id, M), mk(`${code}-91`, U, 'bonus')];
      expect(settle('valid', checks, exemptFor(code, checks))).toBe('valid');
    });
  }

  frm('ungültig und im Aufbau bleiben unverändert', () => {
    const checks = [mk('GAR-01', U)];
    const exempt = exemptFor('GAR', checks);
    expect((['invalid', 'forming'] as Verdict[]).map((v) => settle(v, checks, exempt))).toEqual(['invalid', 'forming']);
  });

  frm('ausgenommen sind inaktive Zeilen, BAT-01 bei erfülltem BAT-02 und CDT-12 bei erfülltem CDT-13', () => {
    const cases: [(typeof CODES)[number], Check[]][] = [
      ['CRB', [mk('CRB-08', U, 'required', { inactive: true })]],
      ['BAT', [mk('BAT-01', U), mk('BAT-02', M)]],
      ['CDT', [mk('CDT-12', U), mk('CDT-13', M, 'required')]],
    ];
    for (const [code, checks] of cases) expect(settle('valid', checks, exemptFor(code, checks)), `${code} ${checks.map((c) => c.id)}`).toBe('valid');
  });

  frm('wartende Regeln sind nicht ausgenommen: ist der Endpunkt nicht gemessen, bleibt der Treffer im Aufbau', () => {
    const ids: [(typeof CODES)[number], string][] = [
      ['ABCD', 'ABCD-07'], ['ABCD', 'ABCD-11'], ['GAR', 'GAR-05'], ['BAT', 'BAT-07'], ['BUT', 'BUT-06'], ['BUT', 'BUT-07'],
      ['CRB', 'CRB-04'], ['CRB', 'CRB-05'], ['CYP', 'CYP-07'], ['CDT', 'CDT-05'],
    ];
    for (const [code, id] of ids) {
      const checks = [mk(id, U)];
      expect(settle('valid', checks, exemptFor(code, checks)), id).toBe('forming');
    }
  });

  frm('CDT-12 nicht messbar: mit erfülltem CDT-13 gültig und ohne Hinweis, sonst im Aufbau mit CDT-12 im Hinweis', () => {
    const withCandle = [mk('CDT-12', U), mk('CDT-13', M, 'required')];
    expect(settle('valid', withCandle, exemptFor('CDT', withCandle))).toBe('valid');
    expect(blockingUnknowns(withCandle, exemptFor('CDT', withCandle))).toEqual([]);
    const without = [mk('CDT-12', U), mk('CDT-13', U, 'required')];
    expect(settle('valid', without, exemptFor('CDT', without))).toBe('forming');
    expect(blockingUnknowns(without, exemptFor('CDT', without))).toEqual(['CDT-12', 'CDT-13']);
  });

  frm('BAT-01 ohne erfülltes BAT-02 blockiert', () => {
    const checks = [mk('BAT-01', U), mk('BAT-02', U)];
    expect(blockingUnknowns(checks, exemptFor('BAT', checks))).toEqual(['BAT-01', 'BAT-02']);
  });
});

test.describe('settle: CYP-02 ohne Ausnahme (Befund 16, Variante A)', () => {
  frm('CYP-02 nicht messbar blockiert auf jeder Zeiteinheit, auch auf D1', () => {
    const checks = [mk('CYP-01', M), mk('CYP-02', U)];
    expect(settle('valid', checks, exemptFor('CYP', checks))).toBe('forming');
    expect(blockingUnknowns(checks, exemptFor('CYP', checks))).toEqual(['CYP-02']);
  });
  frm('D1 ist die oberste Zeiteinheit des Kontexts; W1 steht nicht in der Liste', () => {
    expect([...CONTEXT_TIMEFRAMES]).toEqual(['D1', 'H4', 'H1', 'M15']);
  });
});

// ---- Verdrahtung am echten Prüfer ------------------------------------------------------------------------------

const PRE = 40;
const BASE: ReturnType<typeof zig> = [
  ...Array.from({ length: PRE }, () => plain(102.2, 102.2)),
  ...zig([100, 130, 115, 139, 108.35], [10, 4, 14, 8], 3),
];
const D1_UP = zig([100, 120, 110, 140, 125, 160], 8, 3);
const pick = (input: { H4?: typeof BASE; D1?: typeof BASE; W1?: typeof BASE }, tf: 'H4' | 'D1') => {
  const bars: ContextInput = {};
  if (input.H4) bars.H4 = barsOf(input.H4, H4);
  if (input.D1) bars.D1 = barsOf(input.D1, D1);
  if (input.W1) bars.W1 = barsOf(input.W1, 7 * D1);
  return analyzeCyp(new FormationContext('TEST', bars, { trend: FIXTURE_TREND }), END).find((a) => a.tf === tf)!.candidate;
};

test.describe('settle: im Prüfer', () => {
  frm('Cypher H4 ohne D1 → im Aufbau, mit steigender D1 → gültig', () => {
    expect(pick({ H4: BASE }, 'H4').verdict).toBe('forming');
    expect(pick({ H4: BASE, D1: D1_UP }, 'H4').verdict).toBe('valid');
    expect(pick({ H4: BASE, D1: mirror(D1_UP) }, 'H4').verdict).toBe('invalid');
  });
  // Geänderte Erwartung durch Halils Entscheidung A (2026-11-02): vorher gültig (Ausnahme CYP-02 auf D1), jetzt im Aufbau
  frm('Cypher auf D1 ohne W1: nur CYP-02 unbekannt → im Aufbau', () => {
    const c = pick({ D1: BASE }, 'D1');
    expect(c.checks.filter((k) => k.kind === 'required' && k.state === U).map((k) => k.id)).toEqual(['CYP-02']);
    expect(c.verdict).toBe('forming');
  });
  frm('Cypher auf D1 mit steigendem W1 → gültig, mit fallendem W1 → ungültig', () => {
    expect(pick({ D1: BASE, W1: D1_UP }, 'D1').verdict).toBe('valid');
    expect(pick({ D1: BASE, W1: mirror(D1_UP) }, 'D1').verdict).toBe('invalid');
  });
});
