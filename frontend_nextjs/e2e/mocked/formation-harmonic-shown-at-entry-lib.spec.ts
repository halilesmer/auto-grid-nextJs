/**
 * Harmoniken: „beim Einstieg gezeigt“ ist das Ergebnis der Suche zum Schluss der Einstiegskerze (nach Auslassen verborgener Handel und Vorrang
 * laufender Handel), nicht die beste Basis allein (Entscheidung 1122-A3.2). Echte Kerzen aus den Formations-Fixtures, Kerze für Kerze.
 *
 * 1. Auslassen: zum Schluss der Einstiegskerze trug die beste Basis einen verborgenen Handel, gezeigt war die nächstbeste mit einem Handel, der in
 *    dieser Kerze einging. Dieser Handel war gezeigt und bleibt bis zu seinem Ende (1120-A42.1).
 *    bat-sell-h4-01, Butterfly Verkauf, Einstieg 182.139 in der Kerze 2025-12-09 08:00: gezeigt ab 12:00, früher um 12-10 04:00 weg.
 * 2. Vorrang: zum Schluss der Einstiegskerze war ein anderer laufender Handel gezeigt. Der neue Handel war nicht gezeigt und wird nie gezeigt.
 *    abcd-breakc-h4-01, Gartley: um 2026-09-17 00:00 läuft der Verkauf (Einstieg 2026-08-21 12:00); Kauf-Handel, die währenddessen eingingen,
 *    tauchten früher danach „schon laufend“ auf (z. B. um 09-18 00:00).
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeBut, checkButCandidate } from '../../src/lib/formation/butChecks';
import { analyzeGar, checkGarCandidate } from '../../src/lib/formation/garChecks';
import type { Candidate, FormationBar } from '../../src/lib/formation/types';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (title: string, fn: () => void) => test(title, { tag: '@FRM-07' }, fn);
const H4 = 14400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;
const iso = (s: number) => new Date(s * 1000).toISOString().slice(0, 16);

const load = (name: string) => named(`e2e/fixtures/formation/${name}.json`, parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${name}.json`, 'utf-8'))));
/** Handel als Seite, Einstiegskerze und Einstieg (wie die Suche ihn erkennt); ohne eingegangenen Handel `null` */
const tradeOf = (c: Candidate, bars: FormationBar[]) =>
  c.trade?.entry != null && c.trade.status !== undefined && c.trade.entryIdx !== undefined ? `${c.side} ${iso(bars[c.trade.entryIdx].time)} ${c.trade.entry}` : null;
/** nur Seite und Einstiegskerze, für lesbare Erwartungen */
const sideAndCandle = (k: string | null) => k?.split(' ').slice(0, 2).join(' ') ?? null;

const FORMS = { GAR: [analyzeGar, checkGarCandidate], BUT: [analyzeBut, checkButCandidate] } as const;
type Form = keyof typeof FORMS;

/** Kerze für Kerze von `fromIso` bis `toIso`: gezeigte Kandidaten der Suche einer Form */
function walk(form: Form, name: string, fromIso: string, toIso: string) {
  const fx = load(name);
  const ctx = new FormationContext(fx.symbol, { H4: fx.bars }, { trend: trendOf(fx.bars) });
  const memo = new Map<number, Candidate>();
  const shown = (t: number) => {
    if (!memo.has(t)) memo.set(t, FORMS[form][0](ctx, t).find((a) => a.tf === 'H4')!.candidate);
    return memo.get(t)!;
  };
  const times = fx.bars.map((b) => b.time + H4).filter((t) => t >= at(fromIso) && t <= at(toIso));
  return { fx, ctx, shown, times };
}

/** Jeder gezeigte eingegangene Handel war zum Schluss seiner Einstiegskerze gezeigt */
function shownLate(form: Form, name: string, fromIso: string, toIso: string): string[] {
  const { fx, shown, times } = walk(form, name, fromIso, toIso);
  const late: string[] = [];
  for (const t of times) {
    const c = shown(t);
    const k = tradeOf(c, fx.bars);
    if (!k) continue;
    const then = tradeOf(shown(fx.bars[c.trade!.entryIdx!].time + H4), fx.bars);
    if (then !== k) late.push(`${iso(t)}: ${k}, zum Einstieg gezeigt: ${then}`);
  }
  return late;
}

/** Ein gezeigter laufender Handel ist in der nächsten Kerze wieder gezeigt, außer er endet dort */
function lostRunning(form: Form, name: string, fromIso: string, toIso: string): string[] {
  const { fx, ctx, shown, times } = walk(form, name, fromIso, toIso);
  const lost: string[] = [];
  let prev: Candidate | null = null;
  for (const t of times) {
    const c = shown(t);
    if (prev && tradeOf(prev, fx.bars) && prev.trade!.status!.endIdx === undefined && tradeOf(c, fx.bars) !== tradeOf(prev, fx.bars)) {
      const p = prev.points;
      const old = FORMS[form][1](ctx, t, { tf: 'H4', x: p.X, a: p.A, b: p.B, c: p.C });
      if (old.trade?.status?.endIdx === undefined) lost.push(`${iso(t)}: ${tradeOf(prev, fx.bars)} -> ${tradeOf(c, fx.bars)}`);
    }
    prev = c;
  }
  return lost;
}

test.describe('Harmonik: beim Einstieg gezeigt = Ergebnis der Suche zu jenem Schluss', () => {
  frm('Auslassen: bat-sell-h4-01, der als nächstbeste Basis beim Einstieg gezeigte Butterfly-Verkauf bleibt, bis er endet', () => {
    const { fx, shown } = walk('BUT', 'bat-sell-h4-01', '2025-12-09T12:00', '2025-12-10T04:00');
    expect(tradeOf(shown(at('2025-12-09T12:00')), fx.bars)).toBe('sell 2025-12-09T08:00 182.139');
    expect(tradeOf(shown(at('2025-12-10T04:00')), fx.bars), 'gezeigter laufender Handel fehlt').toBe('sell 2025-12-09T08:00 182.139');
    expect(lostRunning('BUT', 'bat-sell-h4-01', '2025-12-05T00:00', '2025-12-16T00:00')).toEqual([]);
    expect(shownLate('BUT', 'bat-sell-h4-01', '2025-12-05T00:00', '2025-12-16T00:00')).toEqual([]);
  });

  frm('Vorrang: abcd-breakc-h4-01, Kauf-Handel, die während des laufenden Verkaufs eingingen, werden nie gezeigt', () => {
    const { fx, shown } = walk('GAR', 'abcd-breakc-h4-01', '2026-09-17T00:00', '2026-09-18T00:00');
    expect(sideAndCandle(tradeOf(shown(at('2026-09-17T00:00')), fx.bars))).toBe('sell 2026-08-21T12:00');
    expect(sideAndCandle(tradeOf(shown(at('2026-09-18T00:00')), fx.bars)), 'Handel, der beim Einstieg nicht gezeigt war').toBeNull();
    expect(shownLate('GAR', 'abcd-breakc-h4-01', '2026-08-15T00:00', '2026-09-30T00:00')).toEqual([]);
  });
});
