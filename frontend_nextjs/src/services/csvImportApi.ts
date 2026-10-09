import { axiosInstance } from '@/lib/api';
import { t } from '@/i18n';
import type { Timeframe } from '@/lib/analysis/candles';

/** CSV-Import (worker_python/src/api/market.py, utils/csv_import.py): Teile hochladen, dann prüfen und übernehmen. */
export interface CsvImport {
  import_id: string;
  symbol: string;
  timeframe: Timeframe;
  filename: string;
  /** Nur `committed` ist als Datenquelle wählbar; `staging` ist unfertig */
  status: 'staging' | 'committed';
  size_bytes: number;
  received_bytes: number;
  bars: number | null;
  first_t: number | null;
  last_t: number | null;
  gaps: number | null;
  offset_sec: number;
  offset_mode?: 'fixed' | 'row';
  created_at: number;
  committed_at: number | null;
}

export interface CsvImportOptions {
  symbol: string;
  timeframe: Timeframe;
  /** Stunden, die zur CSV-Zeit addiert werden, um MT5-Zeit zu erhalten */
  offsetHours: number;
  offsetMode?: 'fixed' | 'row';
}

export interface CsvLineError {
  line: number;
  message: string;
}

/** Fehler der Prüfung (422) oder Überlappung (409), wie der Worker sie liefert */
export class CsvImportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly lineErrors: CsvLineError[] = [],
    readonly overlaps: CsvImport[] = [],
  ) {
    super(message);
  }
}

const base = (accountId: string) => `/market/${encodeURIComponent(accountId)}/imports`;

export async function listCsvImports(accountId: string): Promise<CsvImport[]> {
  const res = await axiosInstance.get<{ imports: CsvImport[] }>(base(accountId));
  return res.data.imports;
}

export async function deleteCsvImport(accountId: string, importId: string): Promise<void> {
  await axiosInstance.delete(`${base(accountId)}/${importId}`);
}

export async function commitCsvImport(accountId: string, importId: string, replace: boolean): Promise<CsvImport> {
  try {
    const res = await axiosInstance.post<CsvImport>(`${base(accountId)}/${importId}/commit`, { replace });
    return res.data;
  } catch (err) {
    const response = (err as { response?: { status: number; data?: { detail?: unknown } } }).response;
    const detail = response?.data?.detail as string | { detail: string; errors?: unknown[] } | undefined;
    if (response && (response.status === 422 || response.status === 409) && detail && typeof detail === 'object') {
      const errors = detail.errors ?? [];
      throw new CsvImportError(
        detail.detail,
        response.status,
        response.status === 422 ? (errors as CsvLineError[]) : [],
        response.status === 409 ? (errors as CsvImport[]) : [],
      );
    }
    if (response && response.status === 422 && typeof detail === 'string') throw new CsvImportError(detail, 422);
    throw err;
  }
}

/**
 * Legt den Import an und lädt die Datei in Teilen hoch (Größe gibt der Worker vor). Gibt die Import-ID zurück;
 * den Commit macht der Aufrufer (bei Überlappung wiederholbar mit `replace`). Beim Abbruch vor der ersten
 * ID wird die verspätete Anlage gelöscht; später kennt der Aufrufer die ID und räumt sie auf.
 */
export async function uploadCsv(
  accountId: string,
  file: File,
  options: CsvImportOptions,
  onProgress: (fraction: number) => void,
  onCreated: (importId: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const created = await axiosInstance.post<{ import_id: string; chunk_bytes: number; offset_mode?: 'fixed' | 'row' }>(
    base(accountId),
    {
      symbol: options.symbol,
      timeframe: options.timeframe,
      filename: file.name,
      size: file.size,
      time_offset_sec: Math.round(options.offsetHours * 3600),
      time_offset_mode: options.offsetMode ?? 'fixed',
    },
    // Wie die Preset-API: Anlage ohne Dateiübertragung; verhindert unbegrenztes Warten auf eine verlorene Antwort.
    { timeout: 30_000 },
  );
  const { import_id: importId, chunk_bytes: chunkBytes } = created.data;
  // POST muss seine ID noch liefern können, wenn der Dialog während der Anlage schließt.
  // Ein abgebrochener Request ließe sonst einen unbekannten Staging-Eintrag zurück.
  if (signal?.aborted) {
    await deleteCsvImport(accountId, importId);
    signal.throwIfAborted();
  }
  if (options.offsetMode === 'row' && created.data.offset_mode !== 'row') {
    await deleteCsvImport(accountId, importId);
    throw new CsvImportError(t('csv.offset.unsupported'), 422);
  }
  onCreated(importId);
  for (let index = 0, start = 0; start < file.size; index += 1, start += chunkBytes) {
    const part = file.slice(start, start + chunkBytes);
    await axiosInstance.put(`${base(accountId)}/${importId}/chunk`, part, {
      params: { index },
      headers: { 'Content-Type': 'application/octet-stream' },
      signal,
    });
    onProgress(Math.min(1, (start + part.size) / file.size));
  }
  return importId;
}
