import { test, expect } from '@playwright/test';
import { useBacktestStore } from '../../src/store/useBacktestStore';
import { DEFAULT_RUN_SETTINGS } from '../../src/lib/backtest/runSettings';
import { defaultZone } from '../../src/utils/zoneHelpers';
import { dataForPreset } from '../../src/lib/backtest/presets';

test('Sechs lokale Kopien sind unabhängig und die siebte wird abgelehnt', { tag: '@BKT-08' }, () => {
  useBacktestStore.setState({ setups: [], runs: {}, activeId: null });
  const draft = { zone: defaultZone(), form: { ...DEFAULT_RUN_SETTINGS }, range: { preset: 'last7' as const }, unsaved: true };
  for (let i = 0; i < 6; i++) expect(useBacktestStore.getState().add(draft)).not.toBeNull();
  expect(useBacktestStore.getState().add(draft)).toBeNull();
  draft.zone.grid_step = 999;
  expect(useBacktestStore.getState().setups[0].zone.grid_step).toBe(0.05);
  const first = useBacktestStore.getState().setups[0];
  useBacktestStore.getState().edit(first.id, { zone: { ...first.zone, grid_step: 2 } });
  expect(useBacktestStore.getState().setups[1].zone.grid_step).toBe(0.05);
});

test('Preset entfernt Identität, Aktivstatus und kontogebundene CSV-Quelle', { tag: '@BKT-11' }, () => {
  const data = dataForPreset({ id: 'local', zone: { ...defaultZone(), symbol: 'USOUSD', magic: 200001, is_active: true },
    form: { ...DEFAULT_RUN_SETTINGS, csvImportId: 'private-import' }, range: { preset: 'last7' }, unsaved: true });
  expect(data.zone).not.toHaveProperty('id');
  expect(data.zone).not.toHaveProperty('magic');
  expect(data.zone).not.toHaveProperty('is_active');
  expect(data.form.csvImportId).toBeNull();
});
