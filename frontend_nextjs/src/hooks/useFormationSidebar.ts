import { useSyncExternalStore } from 'react';

export type SidebarTab = 'conditions' | 'favorites';

const STORAGE_KEY = 'grid-robot-formation-sidebar';
/** Ab dieser Breite (Tailwind `lg`) schiebt die offene Leiste den Chart; darunter läge kein Chart mehr daneben */
const WIDE_QUERY = '(min-width: 1024px)';

interface Stored {
  open: boolean;
  tab: SidebarTab;
}

/** Stand beim ersten Rendern, auf dem Server und bei der Hydration: zu (beide müssen übereinstimmen) */
const SERVER_SNAPSHOT: Stored = { open: false, tab: 'conditions' };

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Kein Speicher (privates Fenster): es gilt der Stand im Arbeitsspeicher bzw. der Startwert
    return null;
  }
}

function parse(raw: string | null): Stored {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<Stored> | null;
    if (value && typeof value.open === 'boolean' && (value.tab === 'conditions' || value.tab === 'favorites')) return { open: value.open, tab: value.tab };
  } catch {
    // Beschädigter Eintrag: es gilt der Startwert
  }
  // Erster Besuch: ab lg offen auf „Bedingungen“, darunter zu
  return { open: window.matchMedia(WIDE_QUERY).matches, tab: 'conditions' };
}

// useSyncExternalStore verlangt denselben Snapshot, solange sich der gespeicherte Text nicht ändert
let cache: { raw: string | null; value: Stored } | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Stored {
  const raw = readRaw();
  if (cache === null || cache.raw !== raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Ein anderer Tab desselben Browsers hat den Stand geändert
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function change(next: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Speichern nicht möglich: die Leiste funktioniert weiter, nur ohne Merken (der Stand bleibt im Arbeitsspeicher)
  }
  // Der gelesene Text kann trotz Fehler gleich geblieben sein; der neue Wert gilt dann für diesen gelesenen Text
  cache = { raw: readRaw(), value: next };
  listeners.forEach((listener) => listener());
}

/** Seitenleiste vom Modus Formation von /chart (Reiter Bedingungen und Favoriten): offen/zu und gewählter Reiter bleiben im Browser. */
export function useFormationSidebar() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  /** Ein Klick auf das Symbol des aktiven Reiters schließt die Leiste, sonst öffnet er sie auf diesem Reiter */
  const toggle = (tab: SidebarTab) => change(state.open && state.tab === tab ? { ...state, open: false } : { open: true, tab });
  const show = (tab: SidebarTab) => change({ open: true, tab });
  const close = () => change({ ...state, open: false });
  return { ...state, toggle, show, close };
}
