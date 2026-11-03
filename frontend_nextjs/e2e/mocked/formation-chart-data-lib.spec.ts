/**
 * UI-13 Chartdaten der Formationsansicht: Datenlücken aus den fehlenden Bereichen der Reihe, Pausen aus den Abständen.
 * Kerzen sind Zeilen [Open, High, Low, Close]; H4-Kerzen ab END (fixtures/formation-rows).
 */
import { expect, test } from '@playwright/test';
import { FormationContext } from '../../src/lib/formation/context';
import { formationChartData } from '../../src/lib/formation/chartData';
import { H4, END, barsOf, type Row } from '../fixtures/formation-rows';

const ui = (name: string, fn: () => void) => test(name, { tag: '@UI-13' }, fn);
const flat = (c: number): Row => [c, c + 1, c - 1, c];
const ROWS: Row[] = [flat(100), flat(101), flat(102), flat(103), flat(104), flat(105)];
const view = (missing: { from: number; to: number }[]) => new FormationContext('TEST', { H4: { bars: barsOf(ROWS, H4), missing } }).view('H4', END)!;

ui('Ohne fehlenden Bereich: keine Lücke, keine Leerstelle', () => {
  const data = formationChartData(view([]), 14400);
  expect(data.missing).toHaveLength(0);
  expect(data.points).toHaveLength(ROWS.length);
});

ui('Ein fehlender Bereich zwischen zwei Kerzen wird eine Fläche; die Leerstelle steht in den Punkten', () => {
  const bars = view([]).bars;
  // Zwischen Kerze 2 und 3 fehlen zwei Kerzen: die Reihe hat dort einen Sprung
  const gapped = [...bars.slice(0, 3), ...bars.slice(3).map(b => ({ ...b, time: b.time + 2 * 14400 }))];
  const missing = [{ from: bars[2].time + 14400, to: bars[2].time + 3 * 14400 }];
  const data = formationChartData({ bars: gapped, missing }, 14400);
  expect(data.missing).toHaveLength(1);
  expect(data.points.length).toBeGreaterThan(gapped.length);
  // Der logische Index einer Kerze hinter der Lücke zählt die Leerstellen mit: er liegt über ihrem Index in den Kerzen
  const after = gapped[3].time;
  expect(data.points.findIndex(p => p.time === after)).toBeGreaterThan(3);
});

ui('Fehlende Bereiche außerhalb der gezeigten Kerzen bleiben weg', () => {
  const bars = view([]).bars;
  const data = formationChartData({ bars, missing: [{ from: bars[5].time + 14400, to: bars[5].time + 10 * 14400 }, { from: bars[0].time - 10 * 14400, to: bars[0].time }] }, 14400);
  expect(data.missing).toHaveLength(0);
  expect(data.points).toHaveLength(ROWS.length);
});
