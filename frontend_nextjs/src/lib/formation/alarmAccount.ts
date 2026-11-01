/**
 * Für welches Konto der Alarm sucht (FRM-30). Gilt das gewählte Konto; ohne Wahl das zuletzt gewählte, das der Alarm im Browser
 * gemerkt hat. Das gemerkte Konto wird nie als Kontowahl der Seiten gesetzt: das Dashboard bleibt nach dem Neuladen ohne Konto.
 */
export type AlarmAccountState = 'ok' | 'checking' | 'none' | 'gone';

export interface AlarmAccount {
  accountId: string | null;
  source: 'selected' | 'remembered' | null;
  /** ok = der Alarm darf suchen; checking = die Kontoliste ist noch nicht da; none = kein Konto; gone = das gemerkte Konto steht nicht in der Liste */
  state: AlarmAccountState;
}

/** `loaded` = die Kontoliste kam mindestens einmal vom Worker; eine geladene leere Liste enthält das gemerkte Konto nicht (gone) */
export function resolveAlarmAccount(selected: string | null, remembered: string | null, accounts: readonly { id: string | number }[], loaded: boolean): AlarmAccount {
  if (selected) return { accountId: selected, source: 'selected', state: 'ok' };
  if (!remembered) return { accountId: null, source: null, state: 'none' };
  if (!loaded) return { accountId: remembered, source: 'remembered', state: 'checking' };
  const known = accounts.some((a) => String(a.id) === remembered);
  return { accountId: remembered, source: 'remembered', state: known ? 'ok' : 'gone' };
}
