import { test, expect } from '@playwright/test';
import { SETTINGS, SETTINGS_LAYOUT } from '../../src/lib/chart-workspace/settings';

const placed = Object.entries(SETTINGS_LAYOUT).flatMap(([section, groups]) =>
  groups.flatMap(group => group.rows.flatMap(row => [row.key, ...(row.extras ?? [])].map(key => ({ key, section })))));

test('Jede Einstellung steht genau einmal im Dialog-Layout', { tag: '@ANA-19' }, () => {
  expect(placed.map(item => item.key).sort()).toEqual(Object.keys(SETTINGS).sort());
});

test('Jede Einstellung bleibt in ihrem Bereich', { tag: '@ANA-19' }, () => {
  expect(placed.filter(({ key, section }) => SETTINGS[key][0] !== section)).toEqual([]);
});
