'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/animated-toast';
import { t, type MessageKey } from '@/i18n';
import {
  isVpsErrorCode,
  stripAnsi,
  type VpsAction,
  type VpsActionResult,
  type VpsLog,
  type VpsLogResult,
  type VpsStatus,
} from '@/lib/vps';

// Bewusst nur lokaler State (wie useMT5Scanner): die VPS-Daten braucht keine andere Komponente.
// /api/vps/* ist die Next.js-Route auf dem Mac, die per SSH arbeitet. Einziger Worker-Aufruf ist der
// Auto-Update-Zustand: er steht nur im laufenden Prozess, SSH sieht bloß den Registry-Wert (UPD-07).

const POLL_MS = 15_000;
// Nach Neustart/Update öfter nachsehen, bis der Worker wieder da ist
const FAST_POLL_MS = 4_000;
const FAST_POLL_DURATION_MS = 90_000;

type PostAction = Extract<VpsAction, 'restart' | 'fix-elevated' | 'restart-ngrok' | 'reboot'>;

async function callVps<T>(path: string, method: 'GET' | 'POST' = 'GET'): Promise<{ status: number; data: T }> {
  const res = await fetch(`/api/vps/${path}`, { method, cache: 'no-store' });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: `HTTP ${res.status}` };
  }
  return { status: res.status, data: data as T };
}

// Server-Fehler mit Code werden in der aktuellen Sprache angezeigt, sonst der Klartext der Route
function errorOf(data: unknown, fallback: string): string {
  const d = data as { error?: string; message?: string; code?: unknown; params?: Record<string, string | number> } | null;
  if (isVpsErrorCode(d?.code)) return t(`vps.err.${d.code}`, d.params);
  return d?.error || d?.message || fallback;
}

/**
 * `pollLogs: false` — log yalnız `selectLog` ile istenince okunur ve `setLogPolling(true)` ile durum yoklamasına katılır
 * (ayar penceresi: worker logu worker'dan gelir, SSH yalnız ngrok logu için açılır).
 */
export function useVps({ pollLogs = true }: { pollLogs?: boolean } = {}) {
  const [status, setStatus] = useState<VpsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState<string | null>(null);
  const [localOnly, setLocalOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<PostAction | null>(null);
  const [logName, setLogName] = useState<VpsLog>('worker');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logNote, setLogNote] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(true);
  const fastUntil = useRef(0);
  const logPolling = useRef(pollLogs);
  // Der Poll liest den gerade gewählten Tab; späte Antworten eines alten Tabs werden verworfen
  const logNameRef = useRef<VpsLog>('worker');
  const refreshStatus = useCallback(async () => {
    try {
      const { status: code, data } = await callVps<VpsStatus | VpsActionResult>('status');
      // Öffentliche Version (Vercel): die Route ist bewusst nur für localhost offen, kein Fehler
      if (code === 403 && (data as { code?: unknown } | null)?.code === 'localOnly') {
        setLocalOnly(true);
        setStatus(null);
        return;
      }
      if (code === 404) {
        setDisabled(errorOf(data, t('vps.status.disabled')));
        setStatus(null);
        return;
      }
      setDisabled(null);
      // Unabhängig vom SSH-Ergebnis: der Worker kann auch bei SSH-Ausfall antworten
      if (data.ok) {
        setStatus(data as VpsStatus);
        setStatusError(null);
      } else {
        setStatusError(errorOf(data, t('vps.status.unreachable')));
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : t('vps.status.serverUnreachable'));
    } finally {
      setLoading(false);
      setRefreshedAt(new Date());
    }
  }, []);

  // Setzt State erst nach dem ersten await (darf so auch direkt im Effect laufen).
  // background: Aufruf aus dem Status-Poll – scheitert er, bleiben die zuletzt gelesenen
  // Zeilen stehen (dass der VPS weg ist, zeigt schon der Status-Banner).
  const loadLogs = useCallback(async (which: VpsLog, background = false) => {
    let lines: string[] | null = null;
    let note: string | null = null;
    try {
      const { data } = await callVps<VpsLogResult | VpsActionResult>(`logs?log=${which}&lines=300`);
      if (data.ok && 'lines' in data) {
        lines = (data.lines ?? []).map(stripAnsi);
        note = data.note ?? null;
      } else {
        note = errorOf(data, t('vps.log.readFailed'));
      }
    } catch (err) {
      note = err instanceof Error ? err.message : t('vps.log.readFailed');
    }
    if (logNameRef.current !== which) return;
    if (lines || !background) setLogLines(lines ?? []);
    setLogNote(note);
    setLogLoading(false);
  }, []);

  const refreshLogs = useCallback(
    (which: VpsLog) => {
      setLogLoading(true);
      void loadLogs(which);
    },
    [loadLogs],
  );

  // Kararlı kimlik: ayar penceresindeki log sekmesi bunu effect bağımlılığı olarak kullanır
  const setLogPolling = useCallback((on: boolean) => {
    logPolling.current = on;
  }, []);

  const selectLog = useCallback(
    (which: VpsLog) => {
      logNameRef.current = which;
      setLogName(which);
      setLogLines([]);
      setLogNote(null);
      refreshLogs(which);
    },
    [refreshLogs],
  );

  const runAction = useCallback(
    async (action: PostAction, options: { stopBots?: boolean } = {}) => {
      setBusy(action);
      try {
        // Bots/MT5 beendet fix-elevated nur mit ausdrücklichem stopBots=1 (1104-K6)
        const path = action === 'fix-elevated' && options.stopBots ? `${action}?stopBots=1` : action;
        const { status: code, data } = await callVps<VpsActionResult>(path, 'POST');
        if (code === 409 && data.code === 'botsElevated') {
          // Die Liste war veraltet: nichts wurde beendet, der Status wird unten neu gelesen
          toast.warning(t('vps.err.botsElevated'), { title: t('vps.err.botsElevated.title') });
        } else if (data.ok) {
          toast.success(data.message || t('vps.action.done'), { title: t(ACTION_TITLE_KEYS[action]) });
          fastUntil.current = Date.now() + FAST_POLL_DURATION_MS;
        } else {
          toast.error(errorOf(data, t('vps.action.failed')), { title: t(ACTION_TITLE_KEYS[action]) });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('vps.action.failed'), {
          title: t(ACTION_TITLE_KEYS[action]),
        });
      } finally {
        setBusy(null);
        void refreshStatus();
      }
    },
    [refreshStatus],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let first = true;
    const loop = async () => {
      // Erste Abfrage immer; danach nur, solange der Tab sichtbar ist (spart SSH-Verbindungen).
      // Das Log läuft mit: nach Update/Neustart zeigt es von selbst den neuen Stand.
      if (first || document.visibilityState === 'visible') {
        await Promise.all([refreshStatus(), logPolling.current ? loadLogs(logNameRef.current, !first) : null]);
      }
      first = false;
      if (cancelled) return;
      timer = setTimeout(loop, Date.now() < fastUntil.current ? FAST_POLL_MS : POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refreshStatus, loadLogs]);

  return {
    status,
    statusError,
    disabled,
    localOnly,
    loading,
    refreshedAt,
    busy,
    logName,
    logLines,
    logNote,
    logLoading,
    refreshStatus,
    refreshLogs: () => refreshLogs(logName),
    selectLog,
    setLogPolling,
    runAction,
  };
}

export const ACTION_TITLE_KEYS: Record<PostAction, MessageKey> = {
  restart: 'vps.action.restart',
  'fix-elevated': 'vps.action.fixElevated',
  'restart-ngrok': 'vps.action.restartNgrok',
  reboot: 'vps.action.reboot',
};

export type { PostAction };
