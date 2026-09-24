'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/animated-toast';
import {
  stripAnsi,
  type VpsAction,
  type VpsActionResult,
  type VpsLog,
  type VpsLogResult,
  type VpsStatus,
  type VpsUpdateCheck,
} from '@/lib/vps';

// Bewusst nur lokaler State (wie useMT5Scanner): die VPS-Daten braucht keine andere Komponente.
// Kein Worker-Aufruf – /api/vps/* ist die Next.js-Route auf dem Mac, die per SSH arbeitet.

const POLL_MS = 15_000;
// Nach Neustart/Update öfter nachsehen, bis der Worker wieder da ist
const FAST_POLL_MS = 4_000;
const FAST_POLL_DURATION_MS = 90_000;

type PostAction = Extract<VpsAction, 'update' | 'restart' | 'restart-ngrok' | 'reboot'>;

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

function errorOf(data: unknown, fallback: string): string {
  const d = data as { error?: string; message?: string } | null;
  return d?.error || d?.message || fallback;
}

export function useVps() {
  const [status, setStatus] = useState<VpsStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState<PostAction | 'check-update' | null>(null);
  const [updateCheck, setUpdateCheck] = useState<VpsUpdateCheck | null>(null);
  const [logName, setLogName] = useState<VpsLog>('worker');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logNote, setLogNote] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(true);
  const fastUntil = useRef(0);
  // Der Poll liest den gerade gewählten Tab; späte Antworten eines alten Tabs werden verworfen
  const logNameRef = useRef<VpsLog>('worker');

  const refreshStatus = useCallback(async () => {
    try {
      const { status: code, data } = await callVps<VpsStatus | VpsActionResult>('status');
      if (code === 404) {
        setDisabled(errorOf(data, 'VPS-Steuerung deaktiviert'));
        setStatus(null);
        return;
      }
      setDisabled(null);
      if (data.ok) {
        setStatus(data as VpsStatus);
        setStatusError(null);
      } else {
        setStatusError(errorOf(data, 'VPS nicht erreichbar'));
      }
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Next.js-Server nicht erreichbar');
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
        note = errorOf(data, 'Log konnte nicht gelesen werden');
      }
    } catch (err) {
      note = err instanceof Error ? err.message : 'Log konnte nicht gelesen werden';
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

  const selectLog = useCallback(
    (which: VpsLog) => {
      logNameRef.current = which;
      setLogName(which);
      refreshLogs(which);
    },
    [refreshLogs],
  );

  const checkUpdate = useCallback(async () => {
    setBusy('check-update');
    try {
      const { data } = await callVps<VpsUpdateCheck & { error?: string }>('check-update');
      if (data.ok) {
        setUpdateCheck(data);
      } else {
        setUpdateCheck(null);
        toast.error(errorOf(data, 'Update-Prüfung fehlgeschlagen'), { title: 'Update-Prüfung' });
      }
    } catch {
      toast.error('Update-Prüfung fehlgeschlagen', { title: 'Update-Prüfung' });
    } finally {
      setBusy(null);
    }
  }, []);

  const runAction = useCallback(
    async (action: PostAction) => {
      setBusy(action);
      try {
        const { data } = await callVps<VpsActionResult>(action, 'POST');
        if (data.ok) {
          toast.success(data.message || 'Erledigt', { title: ACTION_TITLES[action] });
          fastUntil.current = Date.now() + FAST_POLL_DURATION_MS;
          if (action === 'update') setUpdateCheck(null);
        } else {
          toast.error(errorOf(data, 'Fehlgeschlagen'), { title: ACTION_TITLES[action] });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fehlgeschlagen', { title: ACTION_TITLES[action] });
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
        await Promise.all([refreshStatus(), loadLogs(logNameRef.current, !first)]);
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
    loading,
    refreshedAt,
    busy,
    updateCheck,
    logName,
    logLines,
    logNote,
    logLoading,
    refreshStatus,
    refreshLogs: () => refreshLogs(logName),
    selectLog,
    checkUpdate,
    runAction,
  };
}

export const ACTION_TITLES: Record<PostAction, string> = {
  update: 'Update & Neustart',
  restart: 'Worker neu starten',
  'restart-ngrok': 'ngrok neu starten',
  reboot: 'VPS neu starten',
};

export type { PostAction };
