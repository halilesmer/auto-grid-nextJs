import { useCallback, useEffect, useState } from 'react';

export type SidebarTab = 'conditions' | 'favorites';

const STORAGE_KEY = 'grid-robot-formation-sidebar';
/** Ab dieser Breite (Tailwind `lg`) schiebt die offene Leiste den Chart; darunter läge kein Chart mehr daneben */
const WIDE_QUERY = '(min-width: 1024px)';

interface Stored {
  open: boolean;
  tab: SidebarTab;
}

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    if (raw && typeof raw.open === 'boolean' && (raw.tab === 'conditions' || raw.tab === 'favorites')) return { open: raw.open, tab: raw.tab };
  } catch {
    // Kein Speicher oder beschädigter Eintrag: es gilt der Startwert
  }
  return { open: window.matchMedia(WIDE_QUERY).matches, tab: 'conditions' };
}

/**
 * Seitenleiste von /formasyon (Reiter Bedingungen und Favoriten): offen/zu und gewählter Reiter bleiben im Browser.
 * Erster Besuch: ab `lg` offen auf „Bedingungen“, darunter zu. Beim ersten Rendern ist die Leiste zu (Server und Browser
 * müssen übereinstimmen), der gespeicherte Stand folgt direkt danach.
 */
export function useFormationSidebar() {
  const [state, setState] = useState<Stored>({ open: false, tab: 'conditions' });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage gibt es erst im Browser; ein Lazy-Init würde die Hydration brechen
    setState(read());
  }, []);

  const change = useCallback((next: Stored) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Speichern nicht möglich (privates Fenster): die Leiste funktioniert weiter, nur ohne Merken
    }
  }, []);

  /** Ein Klick auf das Symbol des aktiven Reiters schließt die Leiste, sonst öffnet er sie auf diesem Reiter */
  const toggle = (tab: SidebarTab) => change(state.open && state.tab === tab ? { ...state, open: false } : { open: true, tab });
  const show = (tab: SidebarTab) => change({ open: true, tab });
  const close = () => change({ ...state, open: false });

  return { ...state, toggle, show, close };
}
