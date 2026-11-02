/**
 * Abdeckung der Zeichnungen: jede Zeichnung Z-* nennt die Bedingungs-IDs, die sie zeigt, oder trägt die Handel-Kennung
 * `TRADE_RULES` (Einstieg, Stop, Ziel, erreichtes Ziel ohne eigene Bedingung). Eine leere Liste `[]` ist nicht erlaubt,
 * weil sie nicht sagt, ob die Zuordnung fehlt oder bewusst leer ist.
 * FRM-20 Seite Formasyon: Chart mit Zeichnungen
 */
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { scanFormations } from '../../src/lib/formation/scan';
import { analyzeT618 } from '../../src/lib/formation/t618Checks';
import { TRADE_RULES } from '../../src/lib/formation/types';
import { H4 } from '../fixtures/formation-rows';

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-20' }, fn);

const LIB_DIR = 'src/lib/formation';
// Paket Linie (Befund 28) ändert diese Dateien gerade; ihre Zeichnungen werden nach dessen Merge nachgezogen, dann fällt die Liste weg
const PENDING = new Set(['encChecks.ts', 'keiChecks.ts']);
// Echte Kerzenreihen der Formationen, die die Suche der Seite rechnet, dazu T618 (nicht in der Suche, eigener Aufruf)
const SCAN_FIXTURE = /^(abcd|bat|but|cdt|crb|cyp|f2618|gar|lib|obo|tdf|t618)-.*\.json$/;

frm('keine Zeichnung im Quelltext hat eine leere Regelliste []', () => {
  const empty: string[] = [];
  for (const file of readdirSync(LIB_DIR).filter((f) => f.endsWith('.ts') && !PENDING.has(f))) {
    readFileSync(`${LIB_DIR}/${file}`, 'utf-8')
      .split('\n')
      .forEach((line, i) => {
        if (/rules:\s*\[\s*\]/.test(line)) empty.push(`${file}:${i + 1}`);
      });
  }
  expect(empty).toEqual([]);
});

frm('auf echten Kerzenreihen hat jede Zeichnung Bedingungs-IDs oder die Handel-Kennung', () => {
  const unassigned = new Set<string>();
  const trade = new Set<string>();
  for (const file of readdirSync('e2e/fixtures/formation').filter((f) => SCAN_FIXTURE.test(f))) {
    const fx = parseFixture(JSON.parse(readFileSync(`e2e/fixtures/formation/${file}`, 'utf-8')));
    const t = fx.bars[fx.bars.length - 1].time + H4;
    const ctx = () => new FormationContext(fx.symbol, { H4: fx.bars });
    const candidates = [...scanFormations(ctx(), t), ...analyzeT618(ctx(), t)].map((a) => a.candidate);
    for (const candidate of candidates) {
      for (const d of candidate.drawings) {
        if (d.rules === TRADE_RULES) trade.add(d.id);
        else if (d.rules.length === 0) unassigned.add(d.id);
      }
    }
  }
  expect([...unassigned].sort()).toEqual([]);
  // Die Handel-Kennung kommt wirklich bei Zeichnungen an (Stichprobe; vollständig sichert es der Quelltext-Test oben)
  expect([...trade].sort()).toEqual(expect.arrayContaining(['Z-ABCD-05', 'Z-CDT-05', 'Z-GAR-06', 'Z-LIB-04', 'Z-OBO-05', 'Z-T618-03', 'Z-TDF-09']));
  // Die geteilte Liste bleibt leer: ein push an einer Zeichnung änderte sonst alle Handel-Zeichnungen
  expect(TRADE_RULES).toEqual([]);
});
