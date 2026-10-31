/**
 * Formationsalarm ohne Browser (alarm.ts): aus zwei Suchläufen werden Meldungen. Die Kandidaten sind von Hand gebaut.
 * FRM-27 Alarm bei gültig und Zielpunkt, ohne Doppelmeldung
 */
import { test, expect } from '@playwright/test';
import { evaluateAlarm, hitKey, MEMORY_LIMIT, type AlarmSettings } from '../../src/lib/formation/alarm';
import type { ScanFormation, ScanHit } from '../../src/lib/formation/scan';
import type { Verdict } from '../../src/lib/formation/types';

const frm = (name: string, body: () => void) => test(name, { tag: '@FRM-27' }, body);

const pt = (i: number) => ({ time: 1000 + i * 100, price: 10 + i });
const settings: AlarmSettings = { events: { valid: true, target: true }, forms: ['ABCD', 'GAR', 'BAT', 'BUT', 'CRB', 'CYP', 'CDT'] };

function hit(opts: { form?: ScanFormation; tf?: 'H4' | 'H1'; verdict: Verdict; target: boolean; shift?: number }): ScanHit {
  const s = opts.shift ?? 0;
  const points: Record<string, { time: number; price: number }> = { A: pt(s), B: pt(s + 1), C: pt(s + 2) };
  if (opts.target) points[opts.form === 'CDT' ? 'H2' : 'D'] = pt(s + 3);
  return { form: opts.form ?? 'ABCD', tf: opts.tf ?? 'H4', candidate: { code: opts.form ?? 'ABCD', side: 'buy', tf: opts.tf ?? 'H4', points, checks: [], drawings: [], verdict: opts.verdict } };
}

const run = (hits: ScanHit[], memory = {}, baseline = false, s = settings) => evaluateAlarm('EURUSD', hits, memory, s, baseline);

frm('Erster Lauf ist eine stille Grundlinie', () => {
  const first = run([hit({ verdict: 'valid', target: true })], {}, true);
  expect(first.notices).toEqual([]);
  // Der nächste Lauf mit demselben Treffer meldet nichts
  expect(run([hit({ verdict: 'valid', target: true })], first.memory).notices).toEqual([]);
});

frm('Wechsel von im Aufbau auf gültig mit Zielpunkt meldet beides in einer Meldung', () => {
  const base = run([hit({ verdict: 'forming', target: false })], {}, true);
  const next = run([hit({ verdict: 'valid', target: true })], base.memory);
  expect(next.notices).toHaveLength(1);
  expect(next.notices[0]).toMatchObject({ form: 'ABCD', tf: 'H4', side: 'buy', events: ['valid', 'target'] });
  // derselbe Stand im übernächsten Lauf: keine Doppelmeldung
  expect(run([hit({ verdict: 'valid', target: true })], next.memory).notices).toEqual([]);
});

frm('Zielpunkt ohne Gültigkeit meldet nur den Zielpunkt, die Gültigkeit später einzeln', () => {
  const base = run([hit({ verdict: 'forming', target: false })], {}, true);
  const target = run([hit({ verdict: 'forming', target: true })], base.memory);
  expect(target.notices.map((n) => n.events)).toEqual([['target']]);
  const valid = run([hit({ verdict: 'valid', target: true })], target.memory);
  expect(valid.notices.map((n) => n.events)).toEqual([['valid']]);
});

frm('Ungültig werden und Verschwinden melden nichts', () => {
  const base = run([hit({ verdict: 'valid', target: true })], {}, true);
  expect(run([hit({ verdict: 'invalid', target: true })], base.memory).notices).toEqual([]);
  expect(run([], base.memory).notices).toEqual([]);
});

frm('Ein neuer Treffer nach der Grundlinie wird gemeldet, eine andere Verankerung ist ein neuer Treffer', () => {
  const base = run([hit({ verdict: 'valid', target: true })], {}, true);
  const next = run([hit({ verdict: 'valid', target: true }), hit({ verdict: 'valid', target: true, shift: 5 })], base.memory);
  expect(next.notices).toHaveLength(1);
});

frm('Der Schlüssel bleibt gleich, wenn der Zielpunkt dazukommt', () => {
  expect(hitKey('EURUSD', hit({ verdict: 'forming', target: false }))).toBe(hitKey('EURUSD', hit({ verdict: 'valid', target: true })));
  expect(hitKey('EURUSD', hit({ verdict: 'valid', target: true }))).not.toBe(hitKey('GBPUSD', hit({ verdict: 'valid', target: true })));
});

frm('Abgewählte Ereignisse und Formationen melden nichts, werden aber als bekannt gemerkt', () => {
  const base = run([hit({ verdict: 'forming', target: false })], {}, true);
  const off = run([hit({ verdict: 'valid', target: true })], base.memory, false, { ...settings, events: { valid: false, target: true } });
  expect(off.notices.map((n) => n.events)).toEqual([['target']]);
  const noForm = run([hit({ form: 'GAR', verdict: 'valid', target: true })], {}, false, { ...settings, forms: ['ABCD'] });
  expect(noForm.notices).toEqual([]);
  // Späteres Einschalten meldet den schon bekannten Stand nicht nachträglich
  expect(run([hit({ form: 'GAR', verdict: 'valid', target: true })], noForm.memory).notices).toEqual([]);
});

frm('Der Speicher hält höchstens MEMORY_LIMIT Schlüssel und behält die jüngsten', () => {
  let memory = {};
  for (let i = 0; i < MEMORY_LIMIT + 20; i++) memory = run([hit({ verdict: 'valid', target: true, shift: i })], memory, true).memory;
  expect(Object.keys(memory)).toHaveLength(MEMORY_LIMIT);
  expect(Object.keys(memory)).toContain(hitKey('EURUSD', hit({ verdict: 'valid', target: true, shift: MEMORY_LIMIT + 19 })));
});
