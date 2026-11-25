/**
 * D-Pfeil (1124-F2) ohne Browser: dArrow.ts auf echten Kerzen der Butterfly-Fixtures.
 * Fünf Zustände: D wartet, D nah, B-Bruch fehlt, ungültig (mit Grund am B und ohne), D gebildet (kein Pfeil); Texte in tr, en und de.
 * FRM-49 D-Pfeil vor dem D
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { analyzeBut } from '../../src/lib/formation/butChecks';
import { analyzeGar } from '../../src/lib/formation/garChecks';
import { analyzeBat } from '../../src/lib/formation/batChecks';
import { layoutDArrow, MIN_REASON_ARROW_PX, NEAR_PIPS, type DArrowModel } from '../../src/lib/formation/dArrow';
import { ruleText } from '../../src/lib/formation/ruleTexts';
import { pipOf } from '../../src/lib/formation/xabcd';
import { translate } from '../../src/i18n/translate';
import type { Lang } from '../fixtures/i18n';
import { named, trendOf } from '../fixtures/formation-trend';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-49' }, fn);
const H4 = 14400;
const at = (iso: string) => Date.parse(`${iso}:00Z`) / 1000;

type Form = 'BUT' | 'GAR' | 'BAT';
const ANALYZE = { BUT: analyzeBut, GAR: analyzeGar, BAT: analyzeBat } as const;

function modelAt(name: string, iso: string, opts: { lang?: Lang; close?: (price: number | null) => number; width?: number; form?: Form } = {}) {
  const form = opts.form ?? 'BUT';
  const path = `e2e/fixtures/formation/${name}.json`;
  const fixture = named(path, parseFixture(JSON.parse(readFileSync(path, 'utf-8'))));
  const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars }, { trend: trendOf(fixture.bars) });
  const t = at(iso);
  const candidate = ANALYZE[form](ctx, t).find((a) => a.tf === 'H4')!.candidate;
  const closed = fixture.bars.filter((b) => b.time + H4 <= t);
  const last = closed[closed.length - 1];
  const lang = opts.lang ?? 'tr';
  const t0 = fixture.bars[0].time;
  const pip = pipOf(fixture.symbol);
  const x = (time: number) => ((time - t0) / H4) * 8;
  const y = (price: number) => 600 - (price - last.close) * (50 / pip) - 300;
  const build = (close: number) =>
    layoutDArrow({
      candidate,
      form,
      width: 2000,
      lastBar: { time: last.time, close },
      barSec: H4,
      pip,
      x,
      y,
      text: (key, params) => translate(lang, key as never, params),
      fmt: (n) => String(Number(n.toFixed(5))),
      pips: (n) => n.toFixed(1),
      ruleName: (id) => ruleText(lang, id) ?? id,
    });
  const model = build(opts.close ? opts.close(null) : last.close);
  return { candidate, model, last, pip, symbol: fixture.symbol, build, x, y };
}

const needModel = (m: DArrowModel | null): DArrowModel => {
  expect(m).not.toBeNull();
  return m!;
};

// Gartley und Bat (Halil, 1124-F2): B zu flach (Pflicht) und B zu tief (Ausschluss) zeigen den Grund am B, je mit Linie, Pfeil und Pips
const DEPTH_CASES = [
  { form: 'GAR', fixture: 'gar-buy-h4-01', iso: '2025-11-21T04:00', rule: 'GAR-03', deep: false, leg: 'XA', ratio: 0.618 },
  { form: 'GAR', fixture: 'gar-buy-h4-02', iso: '2025-10-16T04:00', rule: 'GAR-15', deep: true, leg: 'XA', ratio: 0.786 },
  { form: 'BAT', fixture: 'bat-bad-h4-01', iso: '2025-10-20T20:00', rule: 'BAT-05', deep: false, leg: 'XA', ratio: 0.5 },
  { form: 'BAT', fixture: 'bat-buy-h4-01', iso: '2025-10-15T04:00', rule: 'BAT-14', deep: true, leg: 'XA', ratio: 0.618 },
] as const;

test.describe('FRM-49 D-Pfeil', () => {
  for (const k of DEPTH_CASES) {
    frm(`${k.form} ${k.rule}: Grund am B (${k.deep ? 'zu tief' : 'zu flach'}) mit Linie am Level, Pfeil und Pips`, () => {
      const r = modelAt(k.fixture, k.iso, { form: k.form });
      expect(r.candidate.verdict).toBe('invalid');
      expect(r.candidate.invalidBy).toEqual([k.rule]);
      const m = needModel(r.model);
      expect(m.state).toBe('invalid');
      expect(m.arrow).toBeNull();
      expect(m.ring).toBeNull();
      const reason = m.reason!;
      expect(reason).not.toBeNull();
      const { X, A, B } = r.candidate.points;
      // Linie am Level der Fib X → A: A + Stufe × (X − A)
      const need = A.price + k.ratio * (X.price - A.price);
      expect(reason.lineY).toBeCloseTo(r.y(need), 5);
      expect(reason.b.y).toBeCloseTo(r.y(B.price), 5);
      // zu flach: B liegt zwischen A und der Linie; zu tief: B liegt jenseits der Linie
      const beyond = Math.abs(B.price - X.price) < Math.abs(need - X.price);
      expect(beyond).toBe(k.deep);
      const pips = (Math.abs(B.price - need) / r.pip).toFixed(1);
      const word = k.deep ? 'pip fazla' : 'pip eksik';
      const levelText = `${k.deep ? 'B bu seviyeyi aşmamalı' : 'B en az buraya inmeli'} · ${k.leg} ${k.ratio} = ${Number(need.toFixed(5))}`;
      const gap = Math.abs(reason.lineY - reason.b.y);
      if (gap >= MIN_REASON_ARROW_PX) {
        expect(reason.lineLabel).toBe(levelText);
        expect(reason.arrowLabel!.text).toBe(`${pips} ${word}`);
      } else {
        expect(reason.arrow).toBeNull();
        expect(reason.lineLabel).toBe(`${levelText} · ${pips} ${word}`);
      }
      expect(m.tip.body).toContain(ruleText('tr', k.rule)!);
      expect(m.tip.title).toBe(k.deep ? 'Geçersiz · B fazla derin' : 'Geçersiz · B yeterince derin değil');
      expect(m.pill.badge).toContain(k.deep ? '>' : '<');
      // Das D-Niveau der Formation bleibt als blasse Linie stehen
      expect(m.level).toMatchObject({ strength: 'faint', label: 'D aranmıyor · formasyon geçersiz' });
    });
  }


  frm('D wartet: D-Niveau kräftig, Pfeil vom Schluss zum D-Ring, Abzeichen mit Kauf, Preis und Pips', () => {
    const r = modelAt('but-buy-h4-02', '2025-11-19T04:00');
    expect(r.candidate.verdict).toBe('forming');
    const m = needModel(r.model);
    expect(m.state).toBe('wait');
    expect(m.side).toBe('buy');
    expect(m.level).toMatchObject({ strength: 'strong', label: 'D hedefi · XA 1.272' });
    expect(m.arrow).not.toBeNull();
    expect(m.arrow!.color).toBe('var(--success)');
    // der Pfeil endet am D-Niveau (8 px davor), der Ring blinkt noch nicht
    expect(Math.abs(m.arrow!.y2 - m.level!.y)).toBeCloseTo(8, 5);
    expect(m.ring).toBeNull();
    expect(m.reason).toBeNull();
    expect(m.pill.main).toMatch(/^AL /);
    expect(m.pill.badge).toMatch(/pip · D bekleniyor$/);
    expect(m.tip.title).toContain('D bekleniyor');
    expect(m.tip.meta).toContain('Eksik zorunlu şart');
  });

  frm('D nah: ab höchstens 5 Pips blinkt der Ring', () => {
    const base = modelAt('but-buy-h4-02', '2025-11-19T04:00');
    const price = Number(base.model!.pill.main.split(' ')[1]);
    const near = needModel(base.build(price + (NEAR_PIPS - 1) * base.pip));
    expect(near.state).toBe('near');
    expect(near.ring).not.toBeNull();
    expect(near.tip.title).toContain('yakın');
    const far = needModel(base.build(price + (NEAR_PIPS + 5) * base.pip));
    expect(far.state).toBe('wait');
    expect(far.ring).toBeNull();
  });

  frm('Verkauf: Pfeil und Abzeichen in der Farbe des Verkaufs, Abzeichen „SAT“', () => {
    const m = needModel(modelAt('but-buy-h4-02', '2025-10-23T16:00').model);
    expect(m.side).toBe('sell');
    const w = needModel(modelAt('but-sell-h4-01', '2026-01-30T12:00').model);
    expect(w.side).toBe('sell');
    expect(['wait', 'near']).toContain(w.state);
    expect(w.arrow!.color).toBe('var(--danger)');
    expect(w.pill.main).toMatch(/^SAT /);
  });

  frm('B-Bruch fehlt: Pfeil zu B, D-Niveau blass, Abzeichen „B Preis · kırılma bekleniyor“', () => {
    const r = modelAt('but-buy-h4-02', '2025-10-23T16:00');
    expect(r.candidate.verdict).toBe('forming');
    expect(r.candidate.checks.find((k) => k.id === 'BUT-06')!.state).toBe('unmet');
    const m = needModel(r.model);
    expect(m.state).toBe('bBreak');
    expect(m.level!.strength).toBe('faint');
    const by = r.y(r.candidate.points.B.price);
    expect(Math.abs(m.arrow!.y2 - by)).toBeCloseTo(8, 5);
    expect(m.arrow!.color).toBe('var(--warning)');
    expect(m.pill.main).toBe(`B ${Number(r.candidate.points.B.price.toFixed(5))}`);
    expect(m.pill.badge).toBe('kırılma bekleniyor');
    expect(m.tip.title).toBe('Önce B kırılmalı');
  });

  // Lang: B liegt weit vom Niveau (37,8 Pips, Pfeil mit Schrift). Kurz: nur 0,2 Pips (Koordinator 1124-F2): kein Pfeil, die Pips stehen in der Zeile der Linie
  for (const [kind, fixture, iso] of [['lang', 'but-buy-h4-02', '2025-10-13T20:00'], ['kurz', 'but-form-h4-01', '2025-10-06T08:00']] as const) {
    frm(`ungültig, B zu flach (BUT-02), ${kind}: kein D-Pfeil, kein Ring; Grund am B mit roter Linie und Pips`, () => {
      const r = modelAt(fixture, iso);
      expect(r.candidate.verdict).toBe('invalid');
      expect(r.candidate.invalidBy).toEqual(['BUT-02']);
      const m = needModel(r.model);
      expect(m.state).toBe('invalid');
      expect(m.arrow).toBeNull();
      expect(m.ring).toBeNull();
      expect(m.level).toMatchObject({ strength: 'faint', label: 'D aranmıyor · formasyon geçersiz' });
      expect(m.pill.main).toBe('Geçersiz');
      const reason = m.reason!;
      expect(reason).not.toBeNull();
      // Linie am nötigen Niveau XA 0,786: A + 0.786 × (X − A)
      const { X, A, B } = r.candidate.points;
      const need = A.price + 0.786 * (X.price - A.price);
      expect(reason.lineY).toBeCloseTo(r.y(need), 5);
      const levelText = `B en az buraya inmeli · XA 0.786 = ${Number(need.toFixed(5))}`;
      const missingText = `${(Math.abs(B.price - need) / r.pip).toFixed(1)} pip eksik`;
      expect(reason.b.y).toBeCloseTo(r.y(B.price), 5);
      expect(m.tip.body).toContain(ruleText('tr', 'BUT-02')!);
      const gap = Math.abs(reason.lineY - reason.b.y);
      if (kind === 'lang') {
        expect(gap).toBeGreaterThanOrEqual(MIN_REASON_ARROW_PX);
        expect(reason.lineLabel).toBe(levelText);
        expect(reason.arrow).not.toBeNull();
        expect(reason.arrowLabel!.text).toBe(missingText);
      } else {
        expect(gap).toBeLessThan(MIN_REASON_ARROW_PX);
        expect(reason.arrow).toBeNull();
        expect(reason.arrowLabel).toBeNull();
        expect(reason.lineLabel).toBe(`${levelText} · ${missingText}`);
      }
      // Die Schrift der Linie und die Schrift von B stehen auf verschiedenen Seiten der Strecke B ↔ Linie
      const lineTextY = reason.lineY + (reason.dir > 0 ? 14 : -6);
      const bTextY = reason.b.y + (reason.dir > 0 ? -9 : 17);
      expect(Math.abs(lineTextY - bTextY)).toBeGreaterThan(20);
      expect((lineTextY - reason.lineY) * reason.dir).toBeGreaterThan(0);
      expect((bTextY - reason.b.y) * reason.dir).toBeLessThan(0);
    });
  }

  frm('ungültig aus anderem Grund: nur das Abzeichen „Geçersiz“ mit Regel, kein Pfeil, kein Ring, kein Grundbild', () => {
    const r = modelAt('but-buy-h4-02', '2025-10-14T04:00');
    expect(r.candidate.verdict).toBe('invalid');
    expect(r.candidate.invalidBy).toEqual(['BUT-03']);
    const m = needModel(r.model);
    expect(m.state).toBe('invalid');
    expect([m.arrow, m.ring, m.reason]).toEqual([null, null, null]);
    expect(m.pill.main).toBe('Geçersiz');
    expect(m.pill.badge.startsWith(ruleText('tr', 'BUT-03')!.slice(0, 20))).toBe(true);
    expect(m.tip.body).toContain(ruleText('tr', 'BUT-03')!);
  });

  frm('D gebildet (gültig): kein Pfeil', () => {
    const r = modelAt('but-buy-h4-02', '2025-11-19T12:00');
    expect(r.candidate.verdict).toBe('valid');
    expect(r.model).toBeNull();
  });

  frm('Texte in tr, en und de: kein Schlüssel bleibt roh, keine Regel-ID im Text', () => {
    for (const lang of ['tr', 'en', 'de'] as Lang[]) {
      for (const [name, iso] of [['but-buy-h4-02', '2025-11-19T04:00'], ['but-buy-h4-02', '2025-10-23T16:00'], ['but-buy-h4-02', '2025-10-13T20:00'], ['but-form-h4-01', '2025-10-06T08:00'], ['but-buy-h4-02', '2025-10-14T04:00']] as const) {
        const m = needModel(modelAt(name, iso, { lang }).model);
        const all = [m.pill.main, m.pill.badge, m.tip.title, m.tip.body, m.tip.meta, m.level?.label ?? '', m.reason?.lineLabel ?? '', m.reason?.arrowLabel?.text ?? ''].join(' ');
        expect(all, `${lang} ${iso}`).not.toMatch(/formation\.dArrow|BUT-\d\d/);
      }
    }
    const de = needModel(modelAt('but-buy-h4-02', '2025-10-13T20:00', { lang: 'de' }).model);
    expect(de.pill.main).toBe('Ungültig');
    const en = needModel(modelAt('but-buy-h4-02', '2025-11-19T04:00', { lang: 'en' }).model);
    expect(en.pill.main).toMatch(/^BUY /);
  });
});
