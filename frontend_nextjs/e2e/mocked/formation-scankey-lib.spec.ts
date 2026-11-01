/**
 * Signatur der geschlossenen Daten (scanKey.ts) ohne Browser.
 * FRM-21 Hintergrundsuche läuft neu, wenn sich eine höhere Zeiteinheit ändert
 */
import { test, expect } from '@playwright/test';
import { closedSignature, scanSignature } from '../../src/lib/formation/scanKey';

const bar = (time: number) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 });
const H1 = 3600;

test.describe('FRM-21 scanKey', () => {
  test('Zähler und Zeit der letzten geschlossenen Kerze stehen in der Signatur', { tag: '@FRM-21' }, () => {
    // at = 7200: Kerze 0 (0..3600) ist zu, Kerze 1 (3600..7200) schließt genau um at
    const bars = [bar(0), bar(H1), bar(2 * H1)];
    expect(closedSignature('H1', bars, 0, 2 * H1)).toBe('H1:2:3600:0');
    expect(closedSignature('H1', bars, 0, H1)).toBe('H1:1:0:0');
  });

  test('Neue H1-Kerze, die um at schließt, ändert die Signatur', { tag: '@FRM-21' }, () => {
    const at = 3 * H1;
    const old = [bar(0), bar(H1)];
    const fresh = [bar(0), bar(H1), bar(2 * H1)];
    expect(closedSignature('H1', old, 0, at)).toBe('H1:2:3600:0');
    expect(closedSignature('H1', fresh, 0, at)).toBe('H1:3:7200:0');
  });

  test('Die laufende Kerze und Kerzen nach at zählen nicht', { tag: '@FRM-21' }, () => {
    const at = 2 * H1;
    const a = closedSignature('H1', [bar(0), bar(H1)], 0, at);
    const b = closedSignature('H1', [bar(0), bar(H1), bar(2 * H1)], 0, at);
    expect(a).toBe('H1:2:3600:0');
    expect(b).toBe(a);
  });

  test('Eine Lücke mehr ändert die Signatur; ohne Kerzen steht n=0', { tag: '@FRM-21' }, () => {
    expect(closedSignature('D1', [], 0, 1000)).toBe('D1:0:-:0');
    expect(closedSignature('D1', [], 2, 1000)).toBe('D1:0:-:2');
  });

  test('scanSignature fügt die Zeiteinheiten in fester Reihenfolge zusammen', { tag: '@FRM-21' }, () => {
    const at = 2 * H1;
    const sig = scanSignature(
      { D1: { bars: [], missing: 0 }, H4: { bars: [], missing: 1 }, H1: { bars: [bar(0), bar(H1)], missing: 0 }, M15: { bars: [], missing: 0 } },
      at,
    );
    expect(sig).toBe('D1:0:-:0,H4:0:-:1,H1:2:3600:0,M15:0:-:0');
  });
});
