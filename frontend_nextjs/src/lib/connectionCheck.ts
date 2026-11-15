import { toast } from '@/components/ui/animated-toast';
import { t } from '@/i18n';
import { loadMe } from '@/services/usersApi';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import { useUserPrefsStore } from '@/store/useUserPrefsStore';
import { probeWorker, statusFromProbe } from './connection';

const FAULTY: ConnectionStatus[] = ['unreachable', 'unauthorized', 'insecure'];

/**
 * Prüft die gespeicherte Verbindung einmal (30-s-Takt, Fensterfokus und „Şimdi dene“ nutzen dieselbe Funktion).
 * Schreibt Status, Zeitpunkte und Fehlergrund in den Store. Kehrt die Verbindung nach einer Störung zurück
 * (1115-A7.3), kommt ein Toast und die persönlichen Einstellungen werden neu geladen.
 */
export async function runConnectionCheck(): Promise<void> {
  const store = useConnectionStore.getState();
  const { baseUrl, apiKey, hydrated } = store;
  if (!hydrated || !baseUrl || store.probing) return;
  store.setProbing(true);
  let stale = false;
  try {
    const result = await probeWorker(baseUrl, apiKey);
    const now = useConnectionStore.getState();
    // Verbindung wurde währenddessen gewechselt: Ergebnis gehört zur alten Adresse
    if (now.baseUrl !== baseUrl || now.apiKey !== apiKey) {
      stale = true;
      return;
    }
    const before = now.status;
    const status = statusFromProbe(result);
    now.recordCheck(status, result.ok ? undefined : { reason: result.reason, ngrokCode: result.ngrokCode });
    // Rol yüklenirken (zaman aşımsız istek) yoklama kilitlenmesin
    useConnectionStore.getState().setProbing(false);
    if (!result.ok) return;
    // Rolle (Admin/Benutzer) hängt am Schlüssel: einmal laden, sobald der Worker antwortet.
    if (!useAuthStore.getState().me) await loadMe();
    if (FAULTY.includes(before)) {
      toast.success(t('conn.recovered.text'), { title: t('conn.recovered'), duration: 5_000 });
      void useUserPrefsStore.getState().load();
    }
  } finally {
    useConnectionStore.getState().setProbing(false);
    if (stale) void runConnectionCheck();
  }
}
