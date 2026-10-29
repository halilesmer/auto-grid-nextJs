/**
 * Fraktal-Zone (FRZ): je messbarer Bedingung ein Fall mit ☑ und einer mit ☐, von Hand gerechnete Kerzenreihen.
 * Kerzen sind Zeilen [Open, High, Low, Close]; die Rechnung steht im Kommentar der Reihe.
 * FRM-02 Formationserkennung: Fraktal-Zone
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FormationContext, type ContextInput } from '../../src/lib/formation/context';
import { parseFixture } from '../../src/lib/formation/fixture';
import { FRZ_CHECK_IDS, analyzeFrz, checkFrzCandidate, type FrzCandidateInput, type FrzOptions } from '../../src/lib/formation/frzChecks';
import type { Candidate, CheckState, FormationBar } from '../../src/lib/formation/types';
import { buildEnv } from '../../src/lib/formation/reasons';

type Row = [number, number, number, number];

const H4 = 14400;
const END = 100_000_000;

const barsOf = (rows: Row[], step = H4, start = 0): FormationBar[] =>
  rows.map(([open, high, low, close], i) => ({ time: start + i * step, open, high, low, close }));

const flat = (c: number): Row => [c, c + 1, c - 1, c];
/** Fünf Kerzen mit einem Fraktal-Hoch L in der Mitte; Körperoberkante L − 2, die Nachbarn schließen deutlich tiefer */
const peak = (l: number): Row[] => [flat(l - 10), flat(l - 6), [l - 4, l, l - 5, l - 2], flat(l - 6), flat(l - 10)];
/** Spiegelt an 200: aus Widerstand wird Unterstützung */
const mirror = (rows: Row[]): Row[] => rows.map(([o, h, l, c]) => [200 - o, 200 - l, 200 - h, 200 - c]);

/**
 * Grundfall: Fraktal-Hoch 110 auf Index 5 (Öffnung 103, Schluss 107 → Körperoberkante 107, Docht 3, Körper 4).
 * Zone [107, 110]. Rechte Nachbarn schließen 100 und 99, linke 103 und 105. Index 6 hat High 106 < 107, ist also
 * kein Fraktal. Letzte Kerze: High 101 → Suchlinie 101.
 */
const BASE: Row[] = [
  [100, 101, 99, 100],
  [100, 102, 99, 101],
  [101, 103, 100, 102],
  [102, 104, 101, 103],
  [103, 106, 102, 105],
  [103, 110, 103, 107],
  [105, 106, 99, 100],
  [100, 102, 98, 99],
  [99, 101, 97, 98],
];

const patched = (rows: Row[], at: number, row: Row): Row[] => rows.map((r, i) => (i === at ? row : r));

/** Rücklauf nach unten mit einem Gegenfraktal (Tief 95 auf dem zweiten Wert) */
const DIP: Row[] = [
  [100, 101, 97, 98],
  [98, 99, 95, 96],
  [96, 98, 95.8, 97],
  [97, 99, 96.5, 98],
  [98, 102, 98, 101],
];
/** Kerze bis 104,5: Test der Zone [107, 110] (Abstand ≥ 107 − 3 = 104), dazu zwei Kerzen weg von der Zone */
const TOUCH: Row[] = [
  [100, 104.5, 99, 104],
  [104, 104, 100, 101],
  [101, 102, 99, 100],
];
/** Grundfall mit n gescheiterten Tests der Zone [107, 110] */
const tested = (n: number): Row[] => {
  const rows = [...BASE];
  for (let k = 0; k < n; k++) rows.push(...DIP, ...TOUCH);
  return rows;
};
/** Zwei Tests (Index 14 und 22) und 25 Kerzen; die Kerze auf Index 25 folgt */
const TESTED2 = tested(2).slice(0, 25);
const WIDE_BREAK: Row = [104, 120, 103, 118];
const NARROW_BREAK: Row = [108, 111.2, 107.8, 111];

const T5 = 5 * H4;

function run(
  rows: Row[],
  input: Partial<FrzCandidateInput> = {},
  options: FrzOptions = {},
  extra: ContextInput = {},
): Candidate {
  const ctx = new FormationContext('TEST', { H4: barsOf(rows), ...extra });
  return checkFrzCandidate(ctx, END, { tf: 'H4', side: 'resistance', time: T5, ...input }, options);
}

const find = (c: Candidate, id: string) => {
  const hit = c.checks.find((x) => x.id === id);
  if (!hit) throw new Error(`keine Prüfung ${id}`);
  return hit;
};
const state = (c: Candidate, id: string): CheckState => find(c, id).state;

const frm = (name: string, fn: () => void) => test(name, { tag: '@FRM-02' }, fn);

test.describe('FRZ: Fraktal und Kandidat (FRZ 01 bis FRZ 05)', () => {
  frm('FRZ 01 ☑: das Dochtende erreicht die Suchlinie 101', () => {
    expect(state(run(BASE, { level: 101 }), 'FRZ-01')).toBe('met');
  });
  frm('FRZ 01 ☐: Suchlinie 111 liegt über dem Dochtende 110', () => {
    expect(state(run(BASE, { level: 111 }), 'FRZ-01')).toBe('unmet');
  });

  frm('FRZ 02 ☑: zwei geschlossene Kerzen rechts', () => {
    const c = run(BASE);
    expect(state(c, 'FRZ-02')).toBe('met');
    expect(c.verdict).toBe('valid');
  });
  frm('FRZ 02 ☐: nur eine geschlossene Kerze rechts, das Fraktal ist noch im Aufbau', () => {
    const c = run(BASE.slice(0, 7));
    expect(state(c, 'FRZ-02')).toBe('unmet');
    expect(find(c, 'FRZ-02').value).toBe(1);
    expect(c.verdict).toBe('forming');
  });
  frm('FRZ 02 ☐: eine Kerze, die noch läuft, zählt nicht (Kontext gibt sie nicht frei)', () => {
    // Kerze 7 öffnet bei 7 × 14400 und endet bei 8 × 14400; zum Zeitpunkt 8 × 14400 − 1 ist sie offen
    const ctx = new FormationContext('TEST', { H4: barsOf(BASE) });
    const c = checkFrzCandidate(ctx, 8 * H4 - 1, { tf: 'H4', side: 'resistance', time: T5 });
    expect(state(c, 'FRZ-02')).toBe('unmet');
    expect(find(c, 'FRZ-02').value).toBe(1);
  });

  frm('FRZ 03 ☑: zwei Kerzen links', () => {
    expect(state(run(BASE), 'FRZ-03')).toBe('met');
  });
  frm('FRZ 03 ☐: Kerze auf Index 1 hat links nur eine Kerze', () => {
    const c = run(BASE, { time: H4 });
    expect(state(c, 'FRZ-03')).toBe('unmet');
    expect(c.verdict).toBe('invalid');
  });

  frm('FRZ 04 ☑: kein Nachbar schließt über 110', () => {
    const c = run(BASE);
    expect(state(c, 'FRZ-04')).toBe('met');
    expect(find(c, 'FRZ-04').value).toBe(0);
  });
  frm('FRZ 04 ☐: der rechte Nachbar schließt bei 111', () => {
    const c = run(patched(BASE, 6, [105, 112, 99, 111]));
    expect(state(c, 'FRZ-04')).toBe('unmet');
    expect(find(c, 'FRZ-04').value).toBe(1);
    expect(c.verdict).toBe('invalid');
  });
  frm('FRZ 04: ein Docht des Nachbarn über 110 ohne Schluss darüber ist erlaubt', () => {
    expect(state(run(patched(BASE, 6, [105, 115, 99, 100])), 'FRZ-04')).toBe('met');
  });

  frm('FRZ 04: ein Nachbar mit Schluss genau auf 110 ist erlaubt (gleich hoch)', () => {
    expect(state(run(patched(BASE, 6, [105, 112, 99, 110])), 'FRZ-04')).toBe('met');
  });

  frm('FRZ 05 ☑: bis zur letzten Kerze kein Schluss über 110, ein Docht darüber wird nicht gezählt', () => {
    const c = run([...BASE, [100, 111, 99, 100]]);
    expect(state(c, 'FRZ-05')).toBe('met');
    expect(find(c, 'FRZ-05').value).toBe(1);
  });
  frm('FRZ 05 ☐: eine spätere Kerze schließt bei 111', () => {
    expect(state(run([...BASE, [100, 112, 99, 111]]), 'FRZ-05')).toBe('unmet');
  });
});

test.describe('FRZ: Verletzung und Gültigkeit (FRZ 06 bis FRZ 10)', () => {
  const broken: Row[] = [...BASE, [100, 112, 99, 111]];
  const brokenAndBack: Row[] = [...broken, [111, 112, 100, 100]];

  frm('FRZ 06 ☑: Schluss 111 über dem Dochtende 110 verletzt die Zone', () => {
    const c = run(broken);
    expect(state(c, 'FRZ-06')).toBe('met');
    expect(find(c, 'FRZ-06').value).toBe(9 * H4);
  });
  frm('FRZ 06 ☐: ohne Schluss jenseits', () => {
    expect(state(run(BASE), 'FRZ-06')).toBe('unmet');
  });
  frm('FRZ 06 ☐: Schluss genau auf dem Dochtende 110 verletzt nicht', () => {
    expect(state(run([...BASE, [100, 111, 99, 110]]), 'FRZ-06')).toBe('unmet');
  });
  frm('FRZ 06 ☑: schon 0,1 über dem Dochtende genügt', () => {
    expect(state(run([...BASE, [100, 110.2, 99, 110.1]]), 'FRZ-06')).toBe('met');
  });

  frm('FRZ 07 ☑: Zone ohne Verletzung', () => {
    expect(state(run(BASE), 'FRZ-07')).toBe('met');
  });
  frm('FRZ 07 ☐: verletzte Zone ist ungültig', () => {
    const c = run(broken);
    expect(state(c, 'FRZ-07')).toBe('unmet');
    expect(c.verdict).toBe('invalid');
  });

  frm('FRZ 08 ☑: ein Docht bis 111 ohne Schluss darüber verletzt die Zone nicht', () => {
    const c = run([...BASE, [100, 111, 99, 100]]);
    expect(state(c, 'FRZ-08')).toBe('met');
    expect(find(c, 'FRZ-08').value).toBe(1);
    expect(state(c, 'FRZ-07')).toBe('met');
  });
  frm('FRZ 08 ☐: kein Docht jenseits', () => {
    expect(state(run(BASE), 'FRZ-08')).toBe('unmet');
  });

  // H1-Kerze nach der Bildung der H4-Zone: Bildung = Öffnung von Index 7 plus 4 Stunden = 8 × 14400
  const h1Close = (close: number): ContextInput => ({
    H1: barsOf([[100, 112, 99, close]], 3600, 8 * H4 + 3600),
  });
  frm('FRZ 09 ☑: H1-Schluss 111 jenseits, die H4-Zone hält', () => {
    expect(state(run(BASE, {}, {}, h1Close(111)), 'FRZ-09')).toBe('met');
  });
  frm('FRZ 09 ☐: H1-Schluss 108 liegt nicht jenseits', () => {
    expect(state(run(BASE, {}, {}, h1Close(108)), 'FRZ-09')).toBe('unmet');
  });
  frm('FRZ 09 ☐: die H4-Zone selbst ist verletzt', () => {
    expect(state(run([...BASE, [100, 112, 99, 111]], {}, {}, h1Close(111)), 'FRZ-09')).toBe('unmet');
  });

  frm('FRZ 10 ☑: Schluss darüber, dann Schluss unter 107 → Zone ungültig', () => {
    const c = run(brokenAndBack);
    expect(state(c, 'FRZ-10')).toBe('met');
    expect(state(c, 'FRZ-35')).toBe('unmet');
  });
  frm('FRZ 10 ☐: nur ein Schluss darüber', () => {
    expect(state(run(broken), 'FRZ-10')).toBe('unmet');
  });
});

test.describe('FRZ: Zone zeichnen (FRZ 11 bis FRZ 16)', () => {
  const rectOf = (c: Candidate) => {
    const zone = c.drawings.find((d) => d.id === 'Z-FRZ-03' || d.id === 'Z-FRZ-04');
    if (!zone) throw new Error('keine Zonenzeichnung');
    return { top: zone.anchors[0].price, bottom: zone.anchors[1].price };
  };
  const wickless = patched(BASE, 5, [104, 110, 103, 110]);
  const thin = patched(BASE, 5, [104, 110, 103, 109.5]);
  // Hochplateau links und ein niedrigeres High auf Index 6, damit die Nachbarn der Manipulationskerze keine eigenen Fraktale sind
  const manipulation: Row[] = [
    [108, 109, 107, 108],
    [108, 109, 107, 108],
    [108, 109, 107, 108],
    [108, 109, 107, 108],
    [105, 106, 104, 105],
    [100, 110, 99, 102],
    [104, 104.9, 99, 100],
    [100, 102, 98, 99],
    [99, 101, 97, 98],
  ];

  frm('FRZ 11 ☑: Zone vom Dochtende 110 bis zur Körperkante 107', () => {
    const c = run(BASE);
    expect(state(c, 'FRZ-11')).toBe('met');
    expect(find(c, 'FRZ-11').value).toBe(3);
    expect(rectOf(c)).toEqual({ top: 110, bottom: 107 });
  });
  frm('FRZ 11 ☐: kein Docht, die Zone hat keine eigene Höhe', () => {
    expect(state(run(wickless), 'FRZ-11')).toBe('unmet');
  });

  frm('FRZ 13 ☑: Höhe 0,5 < 25 % von 7 (Spanne der rechten Kerze, 1,75) → zu dünn', () => {
    expect(state(run(thin), 'FRZ-13')).toBe('met');
  });
  frm('FRZ 13 ☑: Höhe 1 < 1,75 (grenznah)', () => {
    expect(state(run(patched(BASE, 5, [104, 110, 103, 109])), 'FRZ-13')).toBe('met');
  });
  frm('FRZ 13 ☐: Höhe 2 ≥ 1,75 (grenznah)', () => {
    expect(state(run(patched(BASE, 5, [104, 110, 103, 108])), 'FRZ-13')).toBe('unmet');
  });
  frm('FRZ 13 ☐: Höhe 3 ≥ 1,75', () => {
    expect(state(run(BASE), 'FRZ-13')).toBe('unmet');
  });
  frm('FRZ 13: ohne rechte Nachbarkerze nicht messbar', () => {
    const c = run(BASE.slice(0, 6));
    expect(state(c, 'FRZ-13')).toBe('unmeasurable');
    expect(state(c, 'FRZ-14')).toBe('unmeasurable');
  });

  frm('FRZ 14 ☑: dünne Zone wird auf die Hälfte von 7 = 3,5 erweitert → [106,5; 110]', () => {
    const c = run(thin);
    expect(state(c, 'FRZ-14')).toBe('met');
    expect(rectOf(c)).toEqual({ top: 110, bottom: 106.5 });
  });
  frm('FRZ 14 ☐: Zone ist nicht dünn', () => {
    expect(state(run(BASE), 'FRZ-14')).toBe('unmet');
  });

  frm('FRZ 15 ☑: ohne Docht gilt die Hälfte der linken Kerze (Spanne 4) = 2 → [108; 110]', () => {
    const c = run(wickless);
    expect(state(c, 'FRZ-15')).toBe('met');
    expect(rectOf(c)).toEqual({ top: 110, bottom: 108 });
  });
  frm('FRZ 15 ☐: Kerze hat einen Docht', () => {
    expect(state(run(BASE), 'FRZ-15')).toBe('unmet');
  });

  frm('FRZ 16 ☑ in H4: Docht 8 ≥ 2 × Körper 2 → Zone nur bis zur Körperkante der Nachbarn [102; 105]', () => {
    // eigene Körperkante 102, Nachbarn 105 und 105: weit = min(110, max(102, 105)) = 105, nah = min(102, 105) = 102
    const c = run(manipulation);
    expect(state(c, 'FRZ-16')).toBe('met');
    expect(rectOf(c)).toEqual({ top: 105, bottom: 102 });
  });
  frm('FRZ 16 ☐: dieselbe Kerzenform in H1 ist kein Manipulationsdocht (nur H4)', () => {
    const ctx = new FormationContext('TEST', { H1: barsOf(manipulation, 3600) });
    const c = checkFrzCandidate(ctx, END, { tf: 'H1', side: 'resistance', time: 5 * 3600 });
    expect(state(c, 'FRZ-16')).toBe('unmet');
  });
  frm('FRZ 16 ☐: normaler Docht in H4', () => {
    expect(state(run(BASE), 'FRZ-16')).toBe('unmet');
  });

  frm('FRZ 18: Wirtschaftskalender fehlt, immer nicht messbar', () => {
    expect(state(run(BASE), 'FRZ-18')).toBe('unmeasurable');
  });
});

// Leiter: Fraktal-Hochs 130 (Index 2), 120 (Index 7), 110 (Index 12), Zonen [L − 2, L], letzte Kerze flat(100) mit High 101
const LADDER: Row[] = [...peak(130), ...peak(120), ...peak(110)];
// aufsteigend: das linke Hoch 110 (Index 2) ist niedriger als das rechte 120 (Index 7)
const RISING: Row[] = [...peak(110), ...peak(120)];
const at = (i: number) => ({ time: i * H4 });

// Zusammenlegen: A auf Index 2 (Zone [107; 110]) und B auf Index 8 (Zone [106; 108]) überlappen
const MERGE: Row[] = [
  [97, 98, 96, 97],
  [98, 100, 97, 99],
  [105, 110, 104, 107],
  [105, 106, 100, 101],
  [101, 103, 99, 100],
  [100, 102, 98, 99],
  [100, 104, 99, 102],
  [103, 105, 102, 104],
  [104, 108, 103, 106],
  [105, 106, 100, 101],
  [101, 102, 99, 100],
];

test.describe('FRZ: Auswahl (FRZ 19 bis FRZ 25, FRZ 27)', () => {
  frm('FRZ 19 ☑: das erste Hoch ab der Linie nach links ist die 1. Zone', () => {
    expect(state(run(LADDER, at(12)), 'FRZ-19')).toBe('met');
  });
  frm('FRZ 19 ☐: ein Hoch links, das nicht höher als die gefundene Zone ist, wird nicht gesucht', () => {
    const c = run(RISING, at(2));
    expect(state(c, 'FRZ-19')).toBe('unmet');
    expect(state(run(RISING, at(7)), 'FRZ-19')).toBe('met');
  });

  frm('FRZ 20 ☑: die ersten zwei Zonen in H4', () => {
    const near = run(LADDER, at(12));
    const mid = run(LADDER, at(7));
    expect([find(near, 'FRZ-20').state, find(near, 'FRZ-20').value]).toEqual(['met', 1]);
    expect([find(mid, 'FRZ-20').state, find(mid, 'FRZ-20').value]).toEqual(['met', 2]);
  });
  frm('FRZ 20 ☐: die dritte Zone übersteigt die Anzahl 2', () => {
    const c = run(LADDER, at(2));
    expect(state(c, 'FRZ-20')).toBe('unmet');
    expect(find(c, 'FRZ-20').value).toBe(3);
  });
  frm('FRZ 20: analyzeFrz wählt je Seite nur die zwei Zonen [108; 110] und [118; 120]', () => {
    const ctx = new FormationContext('TEST', { H4: barsOf(LADDER) });
    const zones = analyzeFrz(ctx, END).zones.filter((z) => z.side === 'resistance');
    expect(zones.map((z) => z.rect)).toEqual([
      { top: 110, bottom: 108 },
      { top: 120, bottom: 118 },
    ]);
  });

  // D1: zwölf flache Kerzen, Fraktal-Hoch 104 auf Index 12 (Körperoberkante 101), danach zwei Kerzen; Zone [101; 104]
  const d1Rows = (shift: number): Row[] => [
    ...Array.from({ length: 12 }, (): Row => [100 + shift, 101 + shift, 99 + shift, 100 + shift]),
    [99 + shift, 104 + shift, 98 + shift, 101 + shift],
    [100 + shift, 101 + shift, 99 + shift, 100 + shift],
    [100 + shift, 102 + shift, 100 + shift, 101 + shift],
  ];
  const D1_STEP = 86400;
  frm('FRZ 21 ☑: H4-Kandidat, die D1-Zone [101; 104] liegt 1 über dem Kurs 100 (ATR(14) der D1 ≥ 2)', () => {
    const c = run(LADDER, at(12), {}, { D1: barsOf(d1Rows(0), D1_STEP) });
    expect(state(c, 'FRZ-21')).toBe('met');
  });
  frm('FRZ 21 ☐: die D1-Zone liegt 101 über dem Kurs, weit weg', () => {
    const c = run(LADDER, at(12), {}, { D1: barsOf(d1Rows(100), D1_STEP) });
    expect(state(c, 'FRZ-21')).toBe('unmet');
  });
  frm('FRZ 21 ☐: der D1-Kandidat selbst hat keine höhere Zeiteinheit', () => {
    const ctx = new FormationContext('TEST', { D1: barsOf(d1Rows(0), D1_STEP) });
    const c = checkFrzCandidate(ctx, END, { tf: 'D1', side: 'resistance', time: 12 * D1_STEP });
    expect(state(c, 'FRZ-21')).toBe('unmet');
  });
  frm('FRZ 21: H4 ohne geladene D1 ist nicht messbar', () => {
    expect(state(run(BASE), 'FRZ-21')).toBe('unmeasurable');
  });

  frm('FRZ 22 ☑: zwei überlappende Zonen werden eine, gezeichnet wird das Rechteck um beide [106; 110]', () => {
    const c = run(MERGE, at(2));
    expect(state(c, 'FRZ-22')).toBe('met');
    expect(find(c, 'FRZ-22').value).toBe(2);
    const merged = c.drawings.find((d) => d.id === 'Z-FRZ-05');
    expect(merged?.anchors.map((a) => a.price)).toEqual([110, 106]);
    expect(c.drawings.filter((d) => d.id === 'Z-FRZ-01')).toHaveLength(2);
  });
  frm('FRZ 22 ☑: Lücke 0,5 zwischen [104,5; 106,5] und [107; 110] ist kleiner als die Höhe 2 der kleineren Zone', () => {
    const c = run(patched(MERGE, 8, [103, 106.5, 103, 104.5]), at(2));
    expect(state(c, 'FRZ-22')).toBe('met');
    expect(find(c, 'FRZ-22').value).toBe(2);
  });
  frm('FRZ 22 ☐: einzelne Zone', () => {
    expect(state(run(BASE), 'FRZ-22')).toBe('unmet');
  });

  frm('FRZ 24 ☑: die nahe Zone um 104,5 liegt vor der getesteten stärkeren Zone [107; 110]', () => {
    // nahe Zone = Kerze auf Index 22 (High 104,5), farther Zone Index 5 mit 2 Tests (stark), nahe Zone ungetestet
    expect(state(run(TESTED2, at(22)), 'FRZ-24')).toBe('met');
  });
  frm('FRZ 24 ☐: die stärkere Zone selbst hat keine stärkere hinter sich', () => {
    expect(state(run(TESTED2, at(5)), 'FRZ-24')).toBe('unmet');
  });
  frm('FRZ 24 ☐: ein Fibonacci-Ziel 104,2 in der Zwischenzone hebt den Ausschluss auf', () => {
    expect(state(run(TESTED2, at(22), { fibTargets: [104.2] }), 'FRZ-24')).toBe('unmet');
  });

  frm('FRZ 25 ☑: das jüngste Fraktal der Seite gehört zur aktuellen Welle', () => {
    expect(state(run(LADDER, at(12)), 'FRZ-25')).toBe('met');
  });
  frm('FRZ 25 ☐: ein älteres Fraktal', () => {
    expect(state(run(LADDER, at(7)), 'FRZ-25')).toBe('unmet');
  });

  frm('FRZ 27 ☑: H4 ist eine erlaubte Zeiteinheit', () => {
    expect(state(run(BASE), 'FRZ-27')).toBe('met');
  });
  frm('FRZ 27 ☐: M15-Zonen gelten nur, wenn M15 die Einstiegs-Zeiteinheit ist', () => {
    const ctx = new FormationContext('TEST', { M15: barsOf(BASE, 900) });
    const input: FrzCandidateInput = { tf: 'M15', side: 'resistance', time: 5 * 900 };
    expect(state(checkFrzCandidate(ctx, END, input), 'FRZ-27')).toBe('unmet');
    expect(state(checkFrzCandidate(ctx, END, input, { entryTf: 'M15' }), 'FRZ-27')).toBe('met');
  });
});

test.describe('FRZ: Stärke, Tests und Rollenwechsel (FRZ 29 bis FRZ 39)', () => {
  frm('FRZ 29 ☑: zwei Zonen ineinander = starke Zone', () => {
    const c = run(MERGE, at(2));
    expect(state(c, 'FRZ-29')).toBe('met');
    expect(find(c, 'FRZ-29').value).toBe(2);
  });
  frm('FRZ 29 ☐: einzelne Zone', () => {
    expect(state(run(BASE), 'FRZ-29')).toBe('unmet');
  });

  frm('FRZ 30 ☑: die H4-Zone [107; 110] überlappt die gleiche H1-Zone', () => {
    const c = run(BASE, {}, {}, { H1: barsOf(BASE, 3600) });
    expect(state(c, 'FRZ-30')).toBe('met');
  });
  frm('FRZ 30 ☐: keine andere Zeiteinheit', () => {
    expect(state(run(BASE), 'FRZ-30')).toBe('unmet');
  });

  frm('FRZ 31 ☑: ein Test (Kerze bis 104,5 ≥ 107 − 3) ohne Schluss darüber', () => {
    const c = run(tested(1));
    expect(state(c, 'FRZ-31')).toBe('met');
    expect(find(c, 'FRZ-31').value).toBe(1);
  });
  frm('FRZ 31 ☐: der Kurs kommt nie näher als 104', () => {
    expect(state(run(BASE), 'FRZ-31')).toBe('unmet');
    expect(find(run(BASE), 'FRZ-31').value).toBe(0);
  });
  frm('FRZ 31: ein zweites Berühren ohne Gegenfraktal dazwischen zählt nicht als weiterer Test', () => {
    const c = run([...BASE, ...TOUCH, [100, 104.5, 99, 104]]);
    expect(find(c, 'FRZ-31').value).toBe(1);
  });

  frm('FRZ 32 ☑: zwei gescheiterte Tests = starke Zone', () => {
    const c = run(tested(2));
    expect(state(c, 'FRZ-32')).toBe('met');
    expect(find(c, 'FRZ-32').value).toBe(2);
  });
  frm('FRZ 32 ☐: nur ein Test', () => {
    expect(state(run(tested(1)), 'FRZ-32')).toBe('unmet');
  });

  frm('FRZ 33 ☑: ein Test, keine Verschachtelung → nur potenzielle Zone', () => {
    expect(state(run(tested(1)), 'FRZ-33')).toBe('met');
  });
  frm('FRZ 33 ☐: zwei Tests machen die Zone stark', () => {
    expect(state(run(tested(2)), 'FRZ-33')).toBe('unmet');
  });

  frm('FRZ 34 ☑: drei gescheiterte Tests = sehr starke Zone', () => {
    const c = run(tested(3));
    expect(state(c, 'FRZ-34')).toBe('met');
    expect(find(c, 'FRZ-34').value).toBe(3);
  });
  frm('FRZ 34 ☐: zwei Tests', () => {
    expect(state(run(tested(2)), 'FRZ-34')).toBe('unmet');
  });

  frm('FRZ 35 ☑: Schluss über 110 ohne Schluss zurück → Zone wird zur potenziellen Unterstützung', () => {
    expect(state(run([...BASE, [100, 112, 99, 111]]), 'FRZ-35')).toBe('met');
  });
  frm('FRZ 35 ☐: Zone nicht verletzt', () => {
    expect(state(run(BASE), 'FRZ-35')).toBe('unmet');
  });

  frm('FRZ 36 ☑: Bruch mit einer Kerze der Spanne 17 ≥ 1,5 × Mittel der letzten 20 Spannen', () => {
    expect(state(run([...TESTED2, WIDE_BREAK]), 'FRZ-36')).toBe('met');
  });
  frm('FRZ 36 ☐: Bruch mit einer Kerze der Spanne 3,4 unter der Schwelle', () => {
    expect(state(run([...TESTED2, NARROW_BREAK]), 'FRZ-36')).toBe('unmet');
  });
  frm('FRZ 36: Bruch vor der 21. Kerze ist nicht messbar (zu wenig Vorlauf)', () => {
    expect(state(run([...BASE, [100, 112, 99, 111]]), 'FRZ-36')).toBe('unmeasurable');
  });

  frm('FRZ 37 ☑: starke Zone (2 Tests) mit volumenstarkem Bruch → starke Gegenzone', () => {
    const c = run([...TESTED2, WIDE_BREAK]);
    expect(state(c, 'FRZ-37')).toBe('met');
    expect(find(c, 'FRZ-37').value).toBe(1);
  });
  frm('FRZ 37 ☐: derselbe Bruch mit einer schmalen Kerze', () => {
    expect(state(run([...TESTED2, NARROW_BREAK]), 'FRZ-37')).toBe('unmet');
  });
  frm('FRZ 37 ☐: nur ein Test vor dem Bruch → nur potenzielle Gegenzone', () => {
    expect(state(run([...tested(1), flat(100), flat(100), flat(100), flat(100), WIDE_BREAK]), 'FRZ-37')).toBe('unmet');
  });

  // Rücklauf nach dem Bruch auf Index 25: Tief 110 liegt ≤ 110 + 3 (Rücktest), Tief-Fraktal 110 auf Index 27
  const RETEST: Row[] = [
    [118, 119, 114, 115],
    [115, 116, 110, 112],
    [112, 118, 111.5, 117],
    [117, 119, 113, 118],
  ];
  frm('FRZ 38 ☑: Rücktest bis 110 mit Tief-Fraktal in der Zone', () => {
    expect(state(run([...TESTED2, WIDE_BREAK, ...RETEST]), 'FRZ-38')).toBe('met');
  });
  frm('FRZ 38 ☐: der Kurs kehrt nicht zurück', () => {
    expect(state(run([...TESTED2, WIDE_BREAK, flat(118), flat(118), flat(118)]), 'FRZ-38')).toBe('unmet');
  });

  frm('FRZ 39 ☑: ein Rücktest, Bruch 4 Kerzen zurück', () => {
    const c = run([...TESTED2, WIDE_BREAK, ...RETEST]);
    expect(state(c, 'FRZ-39')).toBe('met');
    expect(find(c, 'FRZ-39').value).toBe(1);
  });
  frm('FRZ 39 ☐: Bruch 31 Kerzen zurück ist nicht mehr frisch', () => {
    const stale = Array.from({ length: 31 }, () => flat(118));
    expect(state(run([...TESTED2, WIDE_BREAK, ...stale]), 'FRZ-39')).toBe('unmet');
  });
  frm('FRZ 39 ☐: Zone ohne Rollenwechsel', () => {
    expect(state(run(BASE), 'FRZ-39')).toBe('unmet');
  });
});

test.describe('FRZ: Zeichnungen und Grundverhalten', () => {
  frm('Z-FRZ 01 bis Z-FRZ 03 und Z-FRZ 06 für eine Widerstandszone, Zeichnung auch bei ☐', () => {
    const c = run(BASE);
    expect(c.drawings.map((d) => d.id)).toEqual(['Z-FRZ-01', 'Z-FRZ-02', 'Z-FRZ-03', 'Z-FRZ-06']);
    const line = c.drawings.find((d) => d.id === 'Z-FRZ-02');
    expect(line?.anchors[0].price).toBe(101);
    const rect = c.drawings.find((d) => d.id === 'Z-FRZ-03');
    // Rechteck vom Fraktal bis eine Kerze hinter die letzte Kerze (8 × 14400 + 14400)
    expect(rect?.anchors).toEqual([
      { time: 5 * H4, price: 110 },
      { time: 9 * H4, price: 107 },
    ]);
    expect(c.drawings.find((d) => d.id === 'Z-FRZ-06')?.timeframes).toEqual(['H4', 'H1']);
    expect(find(c, 'FRZ-11').drawings).toEqual(['Z-FRZ-03']);
    expect(find(c, 'FRZ-02').drawings).toEqual(['Z-FRZ-01']);
    expect(find(c, 'FRZ-19').drawings).toEqual(['Z-FRZ-02']);
    expect(find(c, 'FRZ-31').drawings).toEqual([]);
    const notFound = run(BASE, at(1));
    expect(notFound.drawings.map((d) => d.id)).toEqual(['Z-FRZ-01', 'Z-FRZ-03', 'Z-FRZ-06']);
  });
  frm('Z-FRZ 04 für eine Unterstützungszone: Spiegelbild ergibt dieselben Zustände', () => {
    const resistance = run(BASE);
    const support = run(mirror(BASE), { side: 'support' });
    expect(support.checks.map((x) => x.state)).toEqual(resistance.checks.map((x) => x.state));
    expect(support.side).toBe('buy');
    expect(resistance.side).toBe('sell');
    const rect = support.drawings.find((d) => d.id === 'Z-FRZ-04');
    expect(rect?.anchors.map((a) => a.price)).toEqual([93, 90]);
  });
  frm('Z-FRZ 05 statt Z-FRZ 03, wenn Zonen zusammengelegt sind', () => {
    const c = run(MERGE, at(2));
    expect(c.drawings.map((d) => d.id)).toEqual(['Z-FRZ-01', 'Z-FRZ-01', 'Z-FRZ-02', 'Z-FRZ-05', 'Z-FRZ-06']);
    expect(find(c, 'FRZ-22').drawings).toEqual(['Z-FRZ-05']);
  });
  frm('Z-FRZ 06: D1-Zone auch in H4, H4-Zone auch in H1, H1-Zone nur in H1', () => {
    const visible = (tf: 'D1' | 'H4' | 'H1', step: number) => {
      const ctx = new FormationContext('TEST', { [tf]: barsOf(BASE, step) });
      const c = checkFrzCandidate(ctx, END, { tf, side: 'resistance', time: 5 * step });
      return c.drawings.find((d) => d.id === 'Z-FRZ-06')?.timeframes;
    };
    expect(visible('H4', H4)).toEqual(['H4', 'H1']);
    expect(visible('H1', 3600)).toEqual(['H1']);
    expect(visible('D1', 86400)).toEqual(['D1', 'H4']);
  });

  frm('alle Bedingungen mit Prüfung haben genau einen Zustand je Kandidat', () => {
    const c = run(BASE);
    expect(c.checks.map((x) => x.id)).toEqual([...FRZ_CHECK_IDS]);
    expect(FRZ_CHECK_IDS).toHaveLength(34);
    expect(find(c, 'FRZ-13').status).toBe('assumption');
    expect(find(c, 'FRZ-10').kind).toBe('exclusion');
    expect(find(c, 'FRZ-32').kind).toBe('bonus');
  });
  frm('Kandidat, dessen Kerze noch nicht geschlossen ist: FRZ 02 ☐, alles andere nicht messbar', () => {
    const c = run(BASE, { time: 20 * H4 });
    expect(state(c, 'FRZ-02')).toBe('unmet');
    expect(state(c, 'FRZ-04')).toBe('unmeasurable');
    expect(c.verdict).toBe('forming');
  });
  frm('kein Blick in die Zukunft: zum früheren Zeitpunkt ist der spätere Bruch unsichtbar', () => {
    const ctx = new FormationContext('TEST', { H4: barsOf([...BASE, [100, 112, 99, 111]]) });
    const before = checkFrzCandidate(ctx, 9 * H4, { tf: 'H4', side: 'resistance', time: T5 });
    const after = checkFrzCandidate(ctx, 10 * H4, { tf: 'H4', side: 'resistance', time: T5 });
    expect(state(before, 'FRZ-06')).toBe('unmet');
    expect(state(after, 'FRZ-06')).toBe('met');
  });
  frm('analyzeFrz: Rollenwechsel liefert eine Unterstützung mit der Rolle „reversed“', () => {
    const ctx = new FormationContext('TEST', { H4: barsOf([...BASE, [100, 112, 99, 111]]) });
    const { reversed } = analyzeFrz(ctx, END);
    const zone = reversed.find((z) => z.fractalTimes.includes(T5));
    expect(zone?.side).toBe('support');
    expect(zone?.role).toBe('reversed');
    expect(zone?.rect).toEqual({ top: 110, bottom: 107 });
    expect(zone?.candidate.side).toBe('buy');
  });
});

test.describe('FRZ: echte Kerzen (Fixture)', () => {
  // 66 H4-Kerzen eines Forex-Paares vom 23.09. bis 07.10.2025; davor liefert der Broker keine H4-Kerzen
  const fixture = parseFixture(JSON.parse(readFileSync('e2e/fixtures/formation/frz-zone-h4-01.json', 'utf-8')));
  const end = fixture.bars[fixture.bars.length - 1].time + H4;

  frm('Fixture: jede gewählte Zone besteht FRZ 01 bis FRZ 04, FRZ 07 und FRZ 20; höchstens zwei je Seite', () => {
    const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
    const { zones } = analyzeFrz(ctx, end);
    expect(zones.length).toBeGreaterThan(0);
    for (const side of ['resistance', 'support'] as const) {
      expect(zones.filter((z) => z.side === side).length).toBeLessThanOrEqual(2);
    }
    for (const z of zones) {
      for (const id of ['FRZ-01', 'FRZ-02', 'FRZ-03', 'FRZ-04', 'FRZ-07', 'FRZ-19', 'FRZ-20']) {
        expect(z.candidate.checks.find((x) => x.id === id)?.state, `${id} bei ${z.fractalTimes[0]}`).toBe('met');
      }
      expect(z.candidate.verdict).toBe('valid');
      expect(z.rect.top).toBeGreaterThan(z.rect.bottom);
    }
  });
  frm('Fixture: zur Mitte der Reihe sieht die Erkennung nur die bis dahin geschlossenen Kerzen', () => {
    const ctx = new FormationContext(fixture.symbol, { H4: fixture.bars });
    const half = fixture.bars[33].time + H4;
    const times = analyzeFrz(ctx, half).zones.flatMap((z) => z.fractalTimes);
    expect(times.length).toBeGreaterThan(0);
    expect(times.every((t) => t <= fixture.bars[33].time - 2 * H4)).toBe(true);
  });
});

test.describe('FRZ 24 im Produktionsweg (buildEnv speist die Fibonacci-Ziele)', () => {
  const zonesOf = (rows: Row[]) => buildEnv(new FormationContext('TEST', { H4: barsOf(rows) }), END, 'H4')!.frz.zones;
  // Ziele der Fib 110 → 95,8 (0,618 bei 104,5756) liegen in der Zwischenzone [102,7; 104,7]
  const WITH_TARGET = patched(patched(TESTED2, 22, [100, 104.7, 99, 104.4]), 14, [100, 104.7, 99, 104.4]);
  frm('FRZ 24 ☑ (Ausnahme): Fibonacci-Ziel in der Zwischenzone, sie bleibt in der Auswahl', () => {
    const zones = zonesOf(WITH_TARGET);
    expect(zones.some((z) => z.rect.top === 104.7 && z.rect.bottom === 102.7)).toBe(true);
  });
  frm('FRZ 24 ☐ (Ausschluss): kein Ziel in der Zwischenzone [102,5; 104,5], sie entfällt', () => {
    const zones = zonesOf(TESTED2);
    expect(zones.map((z) => z.rect)).toEqual([
      { top: 110, bottom: 107 },
      { top: 97.05, bottom: 95 },
    ]);
  });
  frm('FRZ 24 ☑ (Ausnahme), Spiegel (Kauf): Fibonacci-Ziel in der Zwischenzone an der Unterstützung', () => {
    const mirrored = WITH_TARGET.map(([o, h, l, c]): Row => [200 - o, 200 - l, 200 - h, 200 - c]);
    const zones = zonesOf(mirrored);
    expect(zones.some((z) => z.side === 'support' && z.rect.top === 97.3 && z.rect.bottom === 95.3)).toBe(true);
  });
});
