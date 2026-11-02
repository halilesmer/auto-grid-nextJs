/**
 * C (ABCD) und N (Doppeltop) werden nicht vor dem fertigen Fraktal gesetzt: bei jedem Prüfzeitpunkt einer echten Reihe
 * ist ein Treffer mit Punkt C (gleich welches Urteil) nur da, wenn ABCD-02 nicht „nicht erfüllt“ ist, einer mit N nur, wenn CDT-03 es nicht ist.
 * FRM-18 Zählung und Sprung
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { scanFormations } from '../../src/lib/formation/scan';
import { H4 } from '../fixtures/formation-rows';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-18' }, fn);

// Jeder Prüfzeitpunkt rechnet die ganze Suche neu (synchron); jede 4. Kerze genügt, ein früh gesetzter Punkt bleibt über mehrere Kerzen stehen
test.setTimeout(180_000);

function offenders(prefix: RegExp, form: string, point: string, checkId: string) {
  const early: string[] = [];
  let seen = 0;
  for (const file of readdirSync('e2e/fixtures/formation').filter((f) => prefix.test(f))) {
    const fx = parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}`, 'utf-8')));
    // Ab der 20. Kerze, davor gibt es keine Schwünge
    for (let k = 20; k < fx.bars.length; k += 4) {
      const t = fx.bars[k].time + H4;
      const hits = scanFormations(new FormationContext(fx.symbol, { H4: fx.bars }), t).filter((h) => h.form === form);
      for (const h of hits) {
        const c = h.candidate;
        if (!c.points[point]) continue;
        seen++;
        if (c.checks.find((x) => x.id === checkId)?.state === 'unmet') early.push(`${file}@${k}`);
      }
    }
  }
  return { early, seen };
}

frm('ABCD: C existiert nicht vor dem fertigen Fraktal (ABCD-02)', () => {
  const r = offenders(/^abcd-.*\.json$/, 'ABCD', 'C', 'ABCD-02');
  expect(r.seen).toBeGreaterThan(0);
  expect(r.early).toEqual([]);
});

frm('Doppeltop: N existiert nicht vor dem fertigen Fraktal (CDT-03)', () => {
  const r = offenders(/^cdt-.*\.json$/, 'CDT', 'N', 'CDT-03');
  expect(r.seen).toBeGreaterThan(0);
  expect(r.early).toEqual([]);
});
