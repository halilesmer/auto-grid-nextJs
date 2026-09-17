import { useAccountStore } from '../useAccountStore';
import { useSettingsStore } from '../useSettingsStore';
import { useLogsStore } from '../useLogsStore';
import { useBotRuntimeStore } from '../useBotRuntimeStore';
import { useSystemStore } from '../useSystemStore';

export function resetAllStores() {
  useAccountStore.getState().resetAccount();
  useSettingsStore.getState().resetSettings();
  useLogsStore.getState().resetLogs();
  useBotRuntimeStore.getState().resetRuntime();
  useSystemStore.getState().resetSystem();
}