import { test, expect } from '@playwright/test';
import { linkedDrawingKey, mergeDrawings, rebaseDrawings } from '../../src/lib/chart-workspace/linkedDrawings';

const first = { id: 'same', kind: 'horizontal-line', points: [{ time: 100, price: 10 }], style: { color: '#000000', width: 1, lineStyle: 'solid' } };

test('Verknüpfen erhält ID-Konflikte und dedupliziert identische Objekte', { tag: '@ANA-17' }, () => {
  const own = JSON.stringify([{ ...first, points: [{ time: 100, price: 20 }] }]);
  const result = mergeDrawings(JSON.stringify([first]), own);
  const drawings = JSON.parse(result);
  expect(drawings).toHaveLength(2);
  expect(drawings[0].points[0].price).toBe(10);
  expect(drawings[1].points[0].price).toBe(20);
  expect(drawings[1].id).not.toBe('same');
  expect(JSON.parse(mergeDrawings(result, own))).toHaveLength(2);
  expect(JSON.parse(mergeDrawings(JSON.stringify([first]), JSON.stringify([first])))).toHaveLength(1);
});

test('Parallele Zeichnungsergänzungen bleiben beim Speichern erhalten', { tag: '@ANA-17' }, () => {
  const own = { ...first, id: 'own' }, remote = { ...first, id: 'remote' };
  const result = JSON.parse(rebaseDrawings('[]', JSON.stringify([own]), JSON.stringify([remote])));
  expect(result.map((d: { id: string }) => d.id)).toEqual(['remote', 'own']);
  const deleted = JSON.parse(rebaseDrawings(JSON.stringify([first]), '[]', JSON.stringify([first, remote])));
  expect(deleted.map((d: { id: string }) => d.id)).toEqual(['remote']);
});

test('Quelle, Konto, exakter Symbolname und CSV bleiben getrennt', { tag: '@ANA-17' }, () => {
  const key = linkedDrawingKey({ source: 'broker', account: 'A', symbol: 'Gold.m' });
  expect(key).not.toBe(linkedDrawingKey({ source: 'broker', account: 'B', symbol: 'Gold.m' }));
  expect(key).not.toBe(linkedDrawingKey({ source: 'broker', account: 'A', symbol: 'GOLD.M' }));
  expect(key).not.toBe(linkedDrawingKey({ source: 'csv:import-one', account: 'A', symbol: 'Gold.m' }));
  expect(key).not.toBe(linkedDrawingKey({ source: 'other-source', account: 'A', symbol: 'Gold.m' }));
});
