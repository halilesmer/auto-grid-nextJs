import { create } from 'zustand';
import { DEFAULT_PERSONAL, readLegacyPersonal, type AlarmPersonal } from '@/lib/formation/alarmPersonal';

interface AlarmPrefsState {
  personal: AlarmPersonal;
  /** Der Wert des Benutzers ist aus dem Worker gelesen (oder übernommen): vorher sucht und meldet der Alarm nicht */
  loaded: boolean;
}

/** Persönliche Alarm-Felder des Benutzers (worker `formation_alarm`, USR-15). `alarmStore.snapshot()` mischt sie mit den Konto-Feldern. */
export const useAlarmPrefsStore = create<AlarmPrefsState>()(() => ({
  // Vor dem Laden zeigt die Anzeige den alten Browser-Wert (falls noch da), damit sie nicht aufblitzt
  personal: typeof window === 'undefined' ? DEFAULT_PERSONAL : (readLegacyPersonal() ?? DEFAULT_PERSONAL),
  loaded: false,
}));
