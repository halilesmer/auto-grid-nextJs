/**
 * UI-25 (1113-A4): Zustand eines Kandidaten in der Formationsreihe. Reine Funktionen `hitState`, `formState`, `reasonOf`:
 * gültig, im Aufbau, nah dran (höchstens NEAR_MISS_MAX_MISSING Pflichtregeln fehlen, keine Ausschlussregel erfüllt), sonstige.
 */
import { expect, test } from '@playwright/test';
import { NEAR_MISS_MAX_MISSING } from '../../src/lib/formation/params';
import { formState, hitState, reasonOf, type ScanHit } from '../../src/lib/formation/scan';
import type { Check, CheckState, RuleKind, Verdict } from '../../src/lib/formation/types';

const ui = (name: string, fn: () => void) => test(name, { tag: '@UI-25' }, fn);

const check = (id: string, kind: RuleKind, state: CheckState, inactive = false): Check =>
  ({ id, kind, status: 'sure', state, drawings: [], ...(inactive ? { inactive: true as const } : {}) }) as unknown as Check;

function hit(verdict: Verdict, checks: Check[], points: Record<string, unknown> = { X: {} }): ScanHit {
  return { form: 'GAR', tf: 'H4', candidate: { verdict, checks, points } } as unknown as ScanHit;
}
const req = (met: number, total: number, id = 'GAR'): Check[] =>
  Array.from({ length: total }, (_, i) => check(`${id}-${i + 1}`, 'required', i < met ? 'met' : 'unmet'));

ui('Schwelle ist 2 fehlende Pflichtregeln', () => expect(NEAR_MISS_MAX_MISSING).toBe(2));

ui('gültig wird gültig, auch mit erfüllter Ausschlussregel', () => {
  expect(hitState(hit('valid', req(7, 7)))).toBe('valid');
});

ui('ungültig mit 2 fehlenden Pflichtregeln und ohne Ausschluss ist nah dran (Cypher 5/7)', () => {
  expect(hitState(hit('invalid', req(5, 7)))).toBe('near');
});

ui('3 fehlende Pflichtregeln (Butterfly 2/5) ist sonstige', () => {
  expect(hitState(hit('invalid', req(2, 5)))).toBe('other');
});

ui('eine erfüllte Ausschlussregel macht aus 6/7 sonstige (Gartley)', () => {
  expect(hitState(hit('invalid', [...req(6, 7), check('GAR-18', 'exclusion', 'met')]))).toBe('other');
  expect(hitState(hit('invalid', [...req(6, 7), check('GAR-18', 'exclusion', 'unmet')]))).toBe('near');
});

ui('nicht messbare Pflichtregeln zählen als fehlend, inaktive gar nicht', () => {
  const unmeasurable = [...req(4, 6), check('GAR-9', 'required', 'unmeasurable')];
  expect(hitState(hit('invalid', unmeasurable))).toBe('other'); // 3 von 7 fehlen
  const withInactive = [...req(5, 7), check('GAR-30', 'required', 'unmet', true)];
  expect(hitState(hit('invalid', withInactive))).toBe('near'); // inaktive Regel zählt nicht
});

ui('im Aufbau ohne Punkt zählt nicht und ist sonstige', () => {
  expect(hitState(hit('forming', req(1, 7), {}))).toBe('other');
});

ui('formState nimmt den besten Kandidaten der Zeiteinheit', () => {
  const near = hit('invalid', req(5, 7));
  const valid = hit('valid', req(7, 7));
  const other = hit('invalid', req(0, 7));
  expect(formState([other, near], 'GAR', 'H4')?.state).toBe('near');
  expect(formState([near, valid, other], 'GAR', 'H4')?.state).toBe('valid');
  expect(formState([near], 'GAR', 'H1')).toBeNull();
  expect(formState([near], 'BAT', 'H4')).toBeNull();
});

ui('reasonOf nennt zuerst den Ausschluss, sonst die erste fehlende Pflichtregel', () => {
  expect(reasonOf(hit('invalid', [...req(6, 7), check('GAR-18', 'exclusion', 'met')]))).toEqual({ kind: 'exclusion', id: 'GAR-18' });
  expect(reasonOf(hit('invalid', req(5, 7)))).toEqual({ kind: 'missing', id: 'GAR-6' });
  expect(reasonOf(hit('valid', req(7, 7)))).toBeNull();
});
