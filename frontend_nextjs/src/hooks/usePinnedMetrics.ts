import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'grid-robot-metrics-pinned';
const listeners = new Set<() => void>();
// Wert im Speicher, falls localStorage gesperrt ist: die Wahl gilt dann bis zum Neuladen
let memory: boolean | null = null;

// Standard: angeheftet. Jeder Zugriff in try/catch (privates Fenster, gesperrter Speicher): dann gilt der Standard.
function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'false';
  } catch {
    return memory ?? true;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Kennzahlen unter der Steuerleiste anheften (V2); die Wahl bleibt im localStorage dieses Browsers. */
export function usePinnedMetrics() {
  const pinned = useSyncExternalStore(subscribe, read, () => true);
  const setPinned = useCallback((next: boolean) => {
    memory = next;
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // Gesperrter Speicher: `memory` trägt die Wahl bis zum Neuladen
    }
    listeners.forEach((l) => l());
  }, []);
  return [pinned, setPinned] as const;
}
