/**
 * Signatur der geschlossenen Daten (scanKey.ts) ohne Browser.
 * FRM-21 Hintergrundsuche läuft neu, wenn sich eine höhere Zeiteinheit ändert
 */
import { test, expect } from '@playwright/test';
import { closedSignature, scanSignature } from '../../src/lib/formation/scanKey';

const bar = (time: number) => ({ time, open: 1, high: 2, low: 0.5, close: 1.5 });
const H1 = 3600;

test.describe('FRM-21 scanKey', () => {
  test('Anzahl und Zeit der letzten geschlossenen Kerze stehen in der Signatur', { tag: '@FRM-21' }, () => {
    // Kerze 1 (3600..7200) schließt genau um at = 7200
    const bars = [bar(0), bar(H1), bar(2 * H1)];
    expect(closedSignature('H1', bars, null, 2 * H1)).toBe('H1:2:3600');
    expect(closedSignature('H1', bars, null, H1)).toBe('H1:1:0');
  });

  test('Neue H1-Kerze, die um at schließt, ändert die Signatur', { tag: '@FRM-21' }, () => {
    const at = 3 * H1;
    expect(closedSignature('H1', [bar(0), bar(H1)], 2 * H1, at)).toBe('H1:2:3600');
    expect(closedSignature('H1', [bar(0), bar(H1), bar(2 * H1)], 3 * H1, at)).toBe('H1:3:7200');
  });

  test('Die Live-Kerze zählt nicht, auch wenn sie nach Zeit schon geschlossen wäre', { tag: '@FRM-21' }, () => {
    // M15 hat über die Stundengrenze geladen (at = 10800), H1 hält noch die vorläufige Kerze 7200..10800 als Live-Kerze
    const stale = closedSignature('H1', [bar(0), bar(H1), bar(2 * H1)], 2 * H1, 3 * H1);
    // Nachladen: dieselbe Kerze hat Endwerte, die neue Live-Kerze beginnt bei 10800
    const fresh = closedSignature('H1', [bar(0), bar(H1), bar(2 * H1), bar(3 * H1)], 3 * H1, 3 * H1);
    expect(stale).toBe('H1:2:3600');
    expect(fresh).toBe('H1:3:7200');
  });

  test('Kerzen nach at zählen nicht; ohne Kerzen steht n=0', { tag: '@FRM-21' }, () => {
    expect(closedSignature('H1', [bar(0), bar(H1)], null, H1)).toBe('H1:1:0');
    expect(closedSignature('H1', [bar(5 * H1)], null, H1)).toBe('H1:0:-');
    expect(closedSignature('D1', [], null, 1000)).toBe('D1:0:-');
  });

  test('scanSignature fügt die Zeiteinheiten in fester Reihenfolge zusammen', { tag: '@FRM-21' }, () => {
    const sig = scanSignature(
      { D1: { bars: [], liveFrom: null }, H4: { bars: [], liveFrom: null }, H1: { bars: [bar(0), bar(H1)], liveFrom: null }, M15: { bars: [], liveFrom: null } },
      2 * H1,
    );
    expect(sig).toBe('D1:0:-,H4:0:-,H1:2:3600,M15:0:-');
  });
});
