import { create } from 'zustand';
import { DEFAULT_CHART_DEFAULT_TF, type ChartDefaultTf } from '@/lib/userPrefs';

/** Kullanıcının varsayılan grafik zaman dilimi (worker'da `chart_tf`, USR-12). `lib/chart/chartUrl.ts` okur. */
export const useChartPrefsStore = create<{ tf: ChartDefaultTf }>()(() => ({ tf: DEFAULT_CHART_DEFAULT_TF }));
