/**
 * Zustand des Bots zwischen den Durchläufen, je Backtest-Lauf eine Instanz (kein globaler Zustand).
 * Quelle: worker_python/src/core/state.py (GridState), src/core/clock.py, src/utils/trade_utils.py
 * (TradeState) und die Datei ui_state_<konto>.json (hier `uiStates`).
 *
 * Logs: statt der türkischen Texte des Bots ein Code mit Werten; der Run-Log (B4) übersetzt sie.
 */

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface EngineLogEntry {
  level: LogLevel;
  code: string;
  params?: Record<string, unknown>;
}

export interface PlacedOrder {
  magic: number;
  placedAt: number;
  price: number;
}

export class EngineState {
  /** Bölge → PAUSE/START/AUTO_CLEAR/CLEAR (active_zones_state) */
  readonly activeZonesState = new Map<number, string>();
  /** Bölge → abgelehnte Orders in Folge (consecutive_errors) */
  readonly consecutiveErrors = new Map<number, number>();
  /** Positions-ID → Volumen der eröffnenden Order (opening_volumes) */
  readonly openingVolumes = new Map<number, number>();
  /** Bölge → Positionszahl bei der letzten Warnung „Höchstzahl erreicht“ */
  readonly limitWarnedZones = new Map<number, number>();
  /** Ticket → "tp|sl", für das die Warnung „TP/SL auf der falschen Seite“ schon kam */
  readonly tpslBlockedLogged = new Map<number, string>();
  /** "bölge|BUY" → Zeit der letzten Sofort-Einstiegs-Order (30-s-Bremse) */
  readonly instantEntrySent = new Map<string, number>();
  /** Vom Bot gesetzte Pending Orders: Ticket → (Magic, Zeit, Preis) */
  readonly placedOrders = new Map<number, PlacedOrder>();
  /** Bölge → Zeiten von außen gelöschter Orders (gleitendes Fenster) */
  readonly vanishedTimes = new Map<number, number[]>();
  /** Vom Bot selbst gelöschte Fraktal-Orders */
  readonly fractalOwnCancels = new Set<number>();
  /** Inhalt von ui_state_<konto>.json; null = Datei gibt es nicht */
  uiStates: Record<string, string> | null = null;

  // TradeState
  algoTradingDisabled = false;
  lastErrorMessage = '';
  lastOrderTicket = 0;

  constructor(
    /** Simulierte Uhr in Sekunden (clock.monotonic und clock.wall) */
    readonly now: () => number,
    private readonly sink: (entry: EngineLogEntry) => void = () => {},
  ) {}

  log(level: LogLevel, code: string, params?: Record<string, unknown>): void {
    this.sink({ level, code, params });
  }

  /** Schreibt einen Bölge-Zustand in die „Datei“ ui_state (wie bg_states[str(idx)] = …) */
  writeUiState(zoneIdx: number, value: string): void {
    this.uiStates = { ...(this.uiStates ?? {}), [String(zoneIdx)]: value };
  }
}
