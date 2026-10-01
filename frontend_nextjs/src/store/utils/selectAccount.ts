import { useAccountStore } from '../useAccountStore';
import { useBotRuntimeStore } from '../useBotRuntimeStore';
import { useSettingsStore } from '../useSettingsStore';

/**
 * Kontowahl an einer Stelle (Dashboard und Analyse-Seite).
 *
 * Wechselt das Konto, werden die Einstellungen und Laufzeitwerte des alten Kontos sofort geleert:
 * sonst zeigte die Seite bis zur Antwort des Workers Zonen, Status oder Preise des alten Kontos
 * unter dem neuen. Wird dasselbe Konto erneut gewählt, wird activeAccount aus der aktuellen
 * Liste neu aufgebaut.
 */
export function selectAccount(accountId: string | null) {
  const store = useAccountStore.getState();
  if (accountId !== store.selectedAccount) {
    useSettingsStore.getState().setSettings(null);
    useBotRuntimeStore.getState().resetRuntime();
  }
  if (accountId) {
    store.setSelectedAccount(accountId);
  } else {
    useAccountStore.setState({ selectedAccount: null, activeAccount: null });
  }
}
