/**
 * Legacy storage keys of the one chart (plan 1107-A21.16): the new key takes over the linked drawing set of the old keys.
 * UI-22 One chart without modes
 */
import { expect, test } from '@playwright/test';
import type { ChartDocument } from '../../src/store/useChartWorkspaceStore';
import { chartWorkspaceKey, legacyDocumentsForMerge, legacyLinkFor, legacyWorkspaceKeys } from '../../src/lib/chart-workspace/legacyKeys';

const ui = (name: string, fn: () => void) => test(name, { tag: '@UI-22' }, fn);
const context = { source: 'src', account: '1', symbol: 'EURUSD' };
const newKey = chartWorkspaceKey(context);
const [free, setup, formation] = legacyWorkspaceKeys(context);

ui('The link of an old key goes to the new key', () => {
  expect(legacyLinkFor({ [setup]: '@linked:a' }, newKey, [free, setup, formation])).toBe('@linked:a');
});

ui('Order Free, Setup, Formation: the first old link wins', () => {
  expect(legacyLinkFor({ [formation]: '@linked:f', [setup]: '@linked:s' }, newKey, [free, setup, formation])).toBe('@linked:s');
  expect(legacyLinkFor({ [formation]: '@linked:f', [free]: '@linked:x' }, newKey, [free, setup, formation])).toBe('@linked:x');
});

ui('An existing link of the new key is not overwritten', () => {
  expect(legacyLinkFor({ [newKey]: '@linked:own', [free]: '@linked:old' }, newKey, [free, setup, formation])).toBeNull();
});

ui('No old link gives null; links of other symbols are ignored', () => {
  expect(legacyLinkFor({}, newKey, [free, setup, formation])).toBeNull();
  const other = legacyWorkspaceKeys({ ...context, symbol: 'GBPUSD' });
  expect(legacyLinkFor({ [other[0]]: '@linked:g' }, newKey, [free, setup, formation])).toBeNull();
});

ui('A linked old key brings no own drawings into the merge (the shared set is authoritative)', () => {
  const doc = (drawings: string): ChartDocument => ({ drawings, indicators: [], images: {}, overlays: {}, alarms: [] });
  const docs = { [free]: doc('[{"id":"stale"}]'), [setup]: doc('[{"id":"own"}]') };
  const out = legacyDocumentsForMerge(docs, { [free]: '@linked:a' }, [free, setup, formation]);
  expect(out.map((d) => d.drawings)).toEqual(['[]', '[{"id":"own"}]']);
  expect(docs[free].drawings).toBe('[{"id":"stale"}]');
});
