/**
 * Testport pro Checkout ohne Browser (e2e/fixtures/env.ts).
 * SYS-10 Jeder Worktree bekommt einen eigenen e2e-Port; CI bleibt bei 3100; E2E_PORT gewinnt.
 */
import { expect, test } from '@playwright/test';
import {
  checkoutRoot,
  E2E_CI_PORT,
  E2E_PORT_MAX,
  E2E_PORT_MIN,
  portForPath,
  resolveE2EPort,
} from '../fixtures/env';

const MAIN = '/Users/dev/auto-grid-nextJs';
const WT_A = '/Users/dev/auto-grid-nextJs/.claude/worktrees/intelligent-williams-58a276';
const WT_B = '/Users/dev/auto-grid-nextJs/.claude/worktrees/brave-curie-1a2b3c';

test.describe('e2e-Port aus dem Checkout-Pfad', { tag: '@SYS-10' }, () => {
  test('verschiedene Checkouts bekommen verschiedene Ports im Bereich', () => {
    const ports = [MAIN, WT_A, WT_B].map(portForPath);
    expect(new Set(ports).size).toBe(3);
    for (const p of ports) {
      expect(p).toBeGreaterThanOrEqual(E2E_PORT_MIN);
      expect(p).toBeLessThanOrEqual(E2E_PORT_MAX);
      expect(p).not.toBe(E2E_CI_PORT);
    }
  });

  test('derselbe Pfad gibt immer denselben Port', () => {
    expect(portForPath(WT_A)).toBe(portForPath(WT_A));
    expect(resolveE2EPort({}, WT_A)).toBe(portForPath(WT_A));
  });

  test('CI nimmt 3100, unabhängig vom Pfad', () => {
    expect(resolveE2EPort({ CI: 'true' }, WT_A)).toBe(E2E_CI_PORT);
    expect(resolveE2EPort({ CI: 'true' }, WT_B)).toBe(E2E_CI_PORT);
  });

  test('ein gesetztes E2E_PORT gewinnt, auch in CI', () => {
    expect(resolveE2EPort({ E2E_PORT: '3187' }, WT_A)).toBe(3187);
    expect(resolveE2EPort({ E2E_PORT: '3187', CI: 'true' }, WT_A)).toBe(3187);
  });

  test('ein ungültiges E2E_PORT fällt auf die Ableitung zurück', () => {
    expect(resolveE2EPort({ E2E_PORT: 'abc' }, WT_A)).toBe(portForPath(WT_A));
    expect(resolveE2EPort({ E2E_PORT: '' }, WT_A)).toBe(portForPath(WT_A));
  });

  test('die Checkout-Wurzel aus der Umgebung wird übernommen (Playwright-Worker)', () => {
    expect(checkoutRoot({ E2E_CHECKOUT_ROOT: WT_B })).toBe(WT_B);
  });
});
