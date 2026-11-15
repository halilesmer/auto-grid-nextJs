import { defaultDockLayout, parseDockLayout } from '@/lib/chart-workspace/dock';
import { DEFAULT_APPEARANCE } from '@/lib/chart-workspace/settings';
import { parseIndicatorDefaults } from '@/lib/chart-workspace/indicatorStorage';
import { FIB_KIND } from '@/lib/chart-workspace/fibStyle';
import {
  decodeAppearance, decodeDrawingDefaults, decodeFibTemplates, decodeSimpleTemplates, decodeTemplates,
  encodeAppearance, encodeDrawingDefaults, encodeFibTemplates, encodeSimpleTemplates, encodeTemplates, type ChartPrefKey,
} from '@/lib/chart-workspace/chartPrefs';
import { encodeOscStandard, parseOscScope, parseOscStandard } from '@/lib/chart-workspace/oscStandard';
import { DEFAULT_TREND_SETTINGS } from '@/lib/formation/params';
import { DEFAULT_FORMATION_STYLE } from '@/lib/formation/lineStyle';
import { layersOf, useAnalysisPrefsStore } from './useAnalysisPrefsStore';
import { useChartWorkspaceStore } from './useChartWorkspaceStore';

/**
 * S7: grafik stil tercihlerinin kullanıcı tercihlerine (`user_prefs`) köprüsü. `current` depodaki değeri yazılacak biçimde verir,
 * `apply` worker'dan gelen değeri depoya koyar, `fallback` worker'da değer yokken geçerli olan varsayılandır.
 */
const ws = () => useChartWorkspaceStore.getState();
const an = () => useAnalysisPrefsStore.getState();
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function currentChartPref(key: ChartPrefKey): Record<string, unknown> {
  const s = ws();
  switch (key) {
    case 'chart_appearance': return { appearance: encodeAppearance(s.appearance) };
    case 'chart_appearance_templates': return encodeTemplates(s.templates);
    case 'chart_dock': return { dock: s.dockLayout };
    case 'chart_favorites': return { favorites: s.favorites };
    case 'chart_indicator_defaults': return { defaults: s.indicatorDefaults };
    case 'chart_drawing_defaults': return encodeDrawingDefaults(s.drawingDefaults);
    case 'chart_drawing_templates': return encodeSimpleTemplates(s.drawingTemplates);
    case 'chart_fib_templates': return encodeFibTemplates(s.drawingTemplates);
    case 'analysis_layers': return layersOf(an());
    case 'analysis_trend': return { trend: an().trend };
    case 'formation_style': return { style: an().formationStyle };
    case 'chart_osc_scope': return { mode: s.oscScope };
    case 'chart_osc_standard': return encodeOscStandard(s.oscStandard);
  }
}

export function applyChartPref(key: ChartPrefKey, value: Record<string, unknown>): void {
  switch (key) {
    case 'chart_appearance': ws().applyPrefs({ appearance: decodeAppearance(value.appearance) }); break;
    case 'chart_appearance_templates': ws().applyPrefs({ templates: decodeTemplates(value) }); break;
    case 'chart_dock': ws().applyPrefs({ dockLayout: parseDockLayout(value.dock) }); break;
    case 'chart_favorites': ws().applyPrefs({ favorites: Array.isArray(value.favorites) ? value.favorites.filter((x): x is string => typeof x === 'string') : ws().favorites }); break;
    case 'chart_indicator_defaults': ws().applyPrefs({ indicatorDefaults: parseIndicatorDefaults(value.defaults) }); break;
    case 'chart_drawing_defaults': ws().applyPrefs({ drawingDefaults: decodeDrawingDefaults(value) }); break;
    case 'chart_drawing_templates': {
      const fib = ws().drawingTemplates[FIB_KIND];
      ws().applyPrefs({ drawingTemplates: { ...decodeSimpleTemplates(value), ...(fib ? { [FIB_KIND]: fib } : {}) } });
      break;
    }
    case 'chart_fib_templates': {
      const { [FIB_KIND]: _old, ...rest } = ws().drawingTemplates; void _old;
      const fib = decodeFibTemplates(value);
      ws().applyPrefs({ drawingTemplates: { ...rest, ...(Object.keys(fib).length ? { [FIB_KIND]: fib } : {}) } });
      break;
    }
    case 'analysis_layers': an().applyPrefs({ layers: value as never }); break;
    case 'analysis_trend': an().applyPrefs({ trend: value.trend }); break;
    case 'formation_style': an().applyPrefs({ formationStyle: value.style }); break;
    case 'chart_osc_scope': ws().applyPrefs({ oscScope: parseOscScope(value) }); break;
    case 'chart_osc_standard': ws().applyPrefs({ oscStandard: parseOscStandard(value) }); break;
  }
}

/** Worker'da değer yokken geçerli olan yazım biçimi (varsayılan). */
export function defaultChartPref(key: ChartPrefKey): Record<string, unknown> {
  switch (key) {
    case 'chart_appearance': return { appearance: encodeAppearance(DEFAULT_APPEARANCE) };
    case 'chart_appearance_templates':
    case 'chart_drawing_templates':
    case 'chart_fib_templates': return { templates: {} };
    case 'chart_dock': return { dock: defaultDockLayout() };
    case 'chart_favorites': return { favorites: ['trend-line', 'horizontal-line', 'fib-retracement'] };
    case 'chart_indicator_defaults': return { defaults: {} };
    case 'chart_drawing_defaults': return { defaults: {} };
    case 'analysis_layers': return { showTrend: false, showZoneLines: true, showZoneCard: true, showLevels: true, showTrades: true, showOrders: true, showPauses: true, showHistory: true, showFractals: true, showGaps: true };
    case 'analysis_trend': return { trend: DEFAULT_TREND_SETTINGS };
    case 'formation_style': return { style: DEFAULT_FORMATION_STYLE };
    case 'chart_osc_scope': return { mode: 'standard' };
    case 'chart_osc_standard': return {};
  }
}

const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);

/** Depodaki (önbellekten gelen) değer varsayılandan farklı mı: göçte yalnız anlamlı değer yazılır. */
export const differsFromDefault = (key: ChartPrefKey): boolean => canon(currentChartPref(key)) !== canon(defaultChartPref(key));
