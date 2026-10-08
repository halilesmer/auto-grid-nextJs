/**
 * Nachrichten zwischen Seite und Web Worker (backtest.worker.ts). Die Seite startet je Lauf einen Worker und bricht
 * ihn mit `terminate()` ab; sie verwirft Nachrichten mit einer alten `runId`. Der Worker lädt die Kerzen selbst
 * (er bekommt Adresse und Schlüssel mit) und schickt nur die Zusammenfassung zurück.
 * Die Nachricht `bars` (Kerzen eines Anzeige-Zeitrahmens für den Chart) kommt mit B6.
 */
import type { SpreadSetting } from '@/lib/backtest/broker/costs';
import type { Timeframe, ZoneDict } from '@/lib/backtest/engine/types';
import type { RunModel, RunResult } from '@/lib/backtest/runner';
import type { SymbolDetail } from '@/store/types';

/** Weg der Kerzen: ein fester Weg, oder `both` = zwei Läufe (Tief zuerst und Hoch zuerst) für die Spanne */
export type PathChoice = 'auto' | 'lowFirst' | 'highFirst' | 'both';

export interface RunParams {
  accountId: string;
  /** Kopie der Zone (auch mit ungespeicherten Änderungen) */
  zone: ZoneDict;
  /** Symbolwerte zum Start des Laufs (Schnappschuss) */
  symbol: SymbolDetail;
  accountCurrency?: string;
  /** Zeitraum [from, to), MT5-Sekunden (Brokerzeit) */
  from: number;
  to: number;
  dataTimeframe: Timeframe;
  /** `csv:<import_id>` für einen CSV-Import, sonst die Kerzen des MT5-Servers */
  source?: string;
  spread: SpreadSetting;
  /** Kommission je Lot, hin und zurück (positiv = Kosten) */
  commissionPerLot: number;
  swapEnabled: boolean;
  /** Berechnungsart außerhalb der unterstützten Liste trotzdem rechnen (Näherungsmodus) */
  approximate: boolean;
  model: Omit<RunModel, 'path'>;
  path: PathChoice;
  startCapital?: number;
  zoneLabel?: string | null;
}

export interface RunRequest {
  type: 'run';
  runId: number;
  /** Worker-Adresse mit /api, ohne abschließenden Schrägstrich */
  apiBase: string;
  /** Kopfzeilen für jede Anfrage (X-API-Key, ngrok) */
  headers: Record<string, string>;
  params: RunParams;
}

export type WorkerMessage =
  | { type: 'progress'; runId: number; phase: 'load' | 'run'; fraction: number }
  /** Ein Ergebnis je Weg: bei `both` zwei, in der Reihenfolge Tief zuerst, Hoch zuerst */
  | { type: 'result'; runId: number; results: RunResult[] }
  | { type: 'error'; runId: number; code: string; params?: Record<string, unknown>; problems?: { code: string; params?: Record<string, unknown> }[]; message?: string };
