/**
 * Zustand des Bot-Nachbaus über die Ticks eines Laufs.
 * Quellen: worker_python/src/core/state.py (GridState, nur die Grid-Felder),
 * src/utils/trade_utils.py (TradeState) und die Zustandsdatei ui_state_<id>.json.
 *
 * Python hält das als Modul-Singletons; hier hat jeder Lauf seinen eigenen Zustand
 * (mehrere Setups laufen unabhängig, BKT-08).
 */
import type { BrokerApi } from './mt5';

export type LogFn = (msg: string, level?: string) => void;

export class EngineState {
  // ---- GridState (Grid-Teil; Fraktal-Felder kommen mit B3)
  /** Position-ID → erstes Volumen der eröffnenden Order (history_orders_get-Cache) */
  openingVolumes = new Map<number, number>();
  /** Zone → Positionszahl bei der letzten Max-Positionen-Warnung */
  limitWarnedZones = new Map<number, number>();
  /** Ticket → "TP|SL", für die einmalige Warnung „TP/SL auf der falschen Seite“ */
  tpslBlockedLogged = new Map<number, string>();
  /** "Zone|Seite" → Zeit des letzten Sofort-Einstiegs (monotonic, 30-s-Bremse) */
  instantEntrySent = new Map<string, number>();
  /** Fraktal-Orders, die der Bot selbst gelöscht hat (fractal_entry, B3) */
  fractalOwnCancels = new Set<number>();
  /** Ticket → [Zonen-Magic, Zeit gesetzt, Preis] der Pending Orders des Bots (vanished.py) */
  placedOrders = new Map<number, [number, number, number]>();
  /** Zone → Zeiten extern gelöschter Orders (gleitendes Fenster) */
  vanishedTimes = new Map<number, number[]>();
  /** filling_mode je Symbol (determine_fill_mode); leer wie im Parity-Lauf */
  fillingMode = new Map<string, number>();

  // ---- TradeState
  algoTradingDisabled = false;
  lastErrorMessage = '';
  lastOrderTicket = 0;

  /**
   * Inhalt von ui_state_<id>.json (Zone-Index als Text → START/PAUSE/AUTO_CLEAR/CLEAR).
   * null = Datei existiert nicht (frischer Bot-Start).
   */
  uiStates: Record<string, string> | null = null;
}

/** Alles, was die Python-Module global erreichen (mt5, state, log, Uhr) */
export interface EngineContext {
  mt5: BrokerApi;
  state: EngineState;
  log: LogFn;
  /** clock.monotonic() bzw. clock.wall() in Sekunden (im Backtest die simulierte Brokerzeit) */
  now: () => number;
}

/** Python `dict.get(key, default)`: default nur, wenn der Schlüssel fehlt (nicht bei null) */
export function pyGet(obj: Record<string, unknown> | null | undefined, key: string, def: unknown): unknown {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : def;
}

/** Python `float(x)`; wirft wie Python bei nicht lesbaren Werten */
export function pyFloat(x: unknown): number {
  if (typeof x === 'number') return x;
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'string' && x.trim() !== '') {
    const v = Number(x.trim());
    if (!Number.isNaN(v) || x.trim().toLowerCase() === 'nan') return v;
  }
  throw new TypeError(`could not convert to float: ${String(x)}`);
}

/** Python `int(x)` (schneidet Nachkommastellen ab) */
export function pyInt(x: unknown): number {
  if (typeof x === 'string') {
    if (!/^\s*[+-]?\d+\s*$/.test(x)) throw new TypeError(`invalid literal for int(): ${x}`);
    return Number.parseInt(x, 10);
  }
  const v = pyFloat(x);
  if (!Number.isFinite(v)) throw new TypeError(`cannot convert ${v} to integer`);
  return Math.trunc(v);
}

/** Python `bool(x)` für JSON-Werte (leere Liste/Objekt sind falsch) */
export function pyBool(x: unknown): boolean {
  if (Array.isArray(x)) return x.length > 0;
  if (x && typeof x === 'object') return Object.keys(x).length > 0;
  return Boolean(x);
}

/** Python `str(x)` für JSON-Werte, soweit die Engine es vergleicht */
export function pyStr(x: unknown): string {
  if (x === true) return 'True';
  if (x === false) return 'False';
  if (x === null || x === undefined) return 'None';
  return String(x);
}

/** `str(zone.get("is_active", True)).lower() != "false"` */
export function isEnabled(zone: Record<string, unknown>): boolean {
  return pyStr(pyGet(zone, 'is_active', true)).toLowerCase() !== 'false';
}
