/**
 * FRM-42: der Entwurf der Trend-Regler überlebt ein erneutes Lesen des Speichers (R1-04) und der Speicher-Zustand
 * behält das Objekt der angewendeten Einstellung, wenn sich nichts geändert hat (R1-05).
 */
import { expect, test } from '@playwright/test';
import { DEFAULT_TREND_SETTINGS } from '../../src/lib/formation/params';

const frm = (name: string, fn: () => void | Promise<void>) => test(name, { tag: '@FRM-42' }, fn);

/** Speicher ohne Browser: `useAnalysisPrefsStore` liest und schreibt `localStorage`. Der Store hält die erste Instanz fest, darum gibt es nur eine, die jeder Test leert. */
const data = new Map<string, string>();
function installStorage() {
  data.clear();
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

async function freshStore() {
  installStorage();
  // `require` statt `import()`: der Store nutzt den Alias `@/`, den Playwright nur für `require` auflöst (Node 22 in CI löst ihn bei `import()` nicht auf)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAnalysisPrefsStore } = require('../../src/store/useAnalysisPrefsStore') as typeof import('../../src/store/useAnalysisPrefsStore');
  // Das Modul bleibt zwischen den Tests im Speicher: jeder Test beginnt mit den Vorgaben
  useAnalysisPrefsStore.setState({ trend: DEFAULT_TREND_SETTINGS, trendDraft: DEFAULT_TREND_SETTINGS });
  await useAnalysisPrefsStore.persist.rehydrate();
  return useAnalysisPrefsStore;
}

frm('Ein erneutes Lesen des Speichers lässt den ungespeicherten Entwurf stehen (R1-04)', async () => {
  const store = await freshStore();
  store.getState().setTrend({ minSize: 3 });
  const applied = store.getState().trend.minSize;
  expect(store.getState().trendDraft.minSize).toBe(3);
  await store.persist.rehydrate();
  expect(store.getState().trendDraft.minSize).toBe(3);
  expect(store.getState().trend.minSize).toBe(applied);
});

frm('Ein erneutes Lesen ohne Entwurf lässt Entwurf und Angewendetes gleich; ein geänderter Speicher gilt für beide (R1-04)', async () => {
  const store = await freshStore();
  await store.persist.rehydrate();
  expect(store.getState().trendDraft).toBe(store.getState().trend);
  // Ein anderer Tab hat 2 gespeichert, dieser Tab hat keinen Entwurf: beide folgen
  const key = 'grid-robot-analysis-prefs';
  const saved = JSON.parse(localStorage.getItem(key) ?? '{}');
  saved.state = { ...(saved.state ?? {}), trend: { ...(saved.state?.trend ?? {}), minSize: 2 } };
  localStorage.setItem(key, JSON.stringify(saved));
  await store.persist.rehydrate();
  expect(store.getState().trend.minSize).toBe(2);
  expect(store.getState().trendDraft.minSize).toBe(2);
});

frm('Ein erneutes Lesen mit gleichen Werten behält das Objekt der angewendeten Einstellung (R1-05)', async () => {
  const store = await freshStore();
  const before = store.getState().trend;
  await store.persist.rehydrate();
  expect(store.getState().trend).toBe(before);
});
