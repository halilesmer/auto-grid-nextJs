'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { toast } from '@/components/ui/animated-toast';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { useT } from '@/i18n';
import { TIMEFRAMES, type Timeframe } from '@/lib/analysis/candles';
import { getApiErrorMessage } from '@/lib/apiError';
import {
  CsvImportError,
  commitCsvImport,
  deleteCsvImport,
  listCsvImports,
  uploadCsv,
  type CsvImport,
  type CsvLineError,
} from '@/services/csvImportApi';

/** Gleiche Grenze wie der Worker (csv_import.MAX_FILE_BYTES) */
const MAX_FILE_MB = 150;
const MAX_OFFSET_HOURS = 14;

type Phase = 'form' | 'upload' | 'check';

interface Props {
  open: boolean;
  accountId: string;
  defaultSymbol: string;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Dialog „CSV importieren“ (BKT-05): Datei in Teilen hochladen, Worker prüft und übernimmt sie. Fehlerhafte
 * Dateien werden vom Worker verworfen und nie wählbar; eine Überlappung geht nur nach „Ersetzen“.
 * Die Modal-Instanz bleibt eingehängt, damit der Zustand beim Schließen neu beginnt (key im Aufrufer).
 */
export function CsvImportDialog({ open, accountId, defaultSymbol, onClose, onImported }: Props) {
  const t = useT();
  const [file, setFile] = useState<File | null>(null);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>('M1');
  const [offsetHours, setOffsetHours] = useState(0);
  const [offsetMode, setOffsetMode] = useState<'fixed' | 'row'>('fixed');
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState(0);
  const [lineErrors, setLineErrors] = useState<CsvLineError[]>([]);
  const [overlaps, setOverlaps] = useState<CsvImport[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const importId = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Schließt die Seite (Kontowechsel, Zurück), läuft ein Upload nicht im Hintergrund weiter
  useEffect(() => () => abort.current?.abort(), []);

  const busy = phase !== 'form';
  const waitingForReplace = overlaps.length > 0; // Import liegt fertig hochgeladen auf dem Worker
  const tooBig = file !== null && file.size > MAX_FILE_MB * 1024 * 1024;
  const offsetValid = Number.isFinite(offsetHours) && Math.abs(offsetHours) <= MAX_OFFSET_HOURS;
  const canSubmit = file !== null && !tooBig && symbol.trim() !== '' && offsetValid && !busy;

  const discard = async () => {
    const id = importId.current;
    importId.current = null;
    if (!id) return;
    try {
      await deleteCsvImport(accountId, id);
    } catch {
      // Unfertiger Import bleibt in der Liste (nicht wählbar, dort löschbar); der Worker räumt ihn nach 24 Stunden
    }
  };

  const close = async () => {
    abort.current?.abort();
    // Ein Import, der bei Überlappung auf „Ersetzen“ wartet, bleibt sonst unfertig liegen
    if (phase !== 'check') await discard();
    onClose();
  };

  const finish = (done: CsvImport) => {
    importId.current = null;
    toast.success(t('csv.done', { bars: done.bars ?? 0, symbol: done.symbol, tf: done.timeframe }));
    onImported();
    onClose();
  };

  const run = async (replace: boolean) => {
    if (!file) return;
    setFailure(null);
    setLineErrors([]);
    try {
      if (importId.current === null) {
        setPhase('upload');
        setProgress(0);
        abort.current = new AbortController();
        await uploadCsv(
          accountId,
          file,
          { symbol: symbol.trim(), timeframe, offsetHours, offsetMode },
          setProgress,
          (id) => {
            importId.current = id;
          },
          abort.current.signal,
        );
      }
      setPhase('check');
      setOverlaps([]);
      finish(await commitCsvImport(accountId, importId.current!, replace));
    } catch (err) {
      setPhase('form');
      if (err instanceof CsvImportError && err.status === 409) {
        setOverlaps(err.overlaps); // Import wartet; „Ersetzen“ wiederholt nur den Commit
        return;
      }
      if (err instanceof CsvImportError) {
        importId.current = null; // der Worker hat die fehlerhafte Datei schon verworfen
        setLineErrors(err.lineErrors);
        setFailure(err.message);
        return;
      }
      if (abort.current?.signal.aborted) return;
      setFailure(await getApiErrorMessage(err, t('csv.failed')));
      // Ohne Urteil des Workers (Netzabbruch, 5xx) kann der Commit schon durch sein: erst nachsehen, nie blind löschen
      const stored = importId.current
        ? await listCsvImports(accountId).then((list) => list.find((i) => i.import_id === importId.current), () => undefined)
        : undefined;
      if (stored?.status === 'committed') {
        finish(stored);
        return;
      }
      if (stored) await discard();
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('csv.dialog.title')} className="max-w-lg" dismissible={!busy}>
      <div className="space-y-4" data-testid="csv-import-dialog">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('csv.format')}</p>
        <p className="text-xs leading-relaxed text-muted-foreground" data-testid="csv-timezone-notice">{t('csv.timezone')}</p>
        <InputField label={t('csv.file')} hint={t('csv.file.hint')}>
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setOverlaps([]);
              setLineErrors([]);
              setFailure(null);
              void discard();
            }}
            className="input-s h-auto py-1.5 text-xs file:mr-3 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs"
            data-testid="csv-file"
          />
        </InputField>
        {tooBig && <p className="text-xs text-danger">{t('csv.tooBig', { max: MAX_FILE_MB })}</p>}
        <InputField label={t('csv.offset.mode')} hint={t('csv.offset.mode.hint')}>
          <select value={offsetMode} disabled={busy || waitingForReplace} data-testid="csv-offset-mode" className="input-s"
            onChange={(e) => {
              const mode = e.target.value as 'fixed' | 'row'; // Optionen unten bilden die geschlossene Menge.
              setOffsetMode(mode);
              if (mode === 'row') setOffsetHours(0);
            }}>
            <option value="fixed">{t('csv.offset.mode.fixed')}</option>
            <option value="row">{t('csv.offset.mode.row')}</option>
          </select>
        </InputField>
        <div className="grid gap-3 sm:grid-cols-3">
          <InputField label={t('csv.symbol')} hint={t('csv.symbol.hint')}>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              disabled={busy || waitingForReplace}
              maxLength={32}
              className="input-s"
              data-testid="csv-symbol"
            />
          </InputField>
          <InputField label={t('csv.timeframe')} hint={t('csv.timeframe.hint')}>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              disabled={busy || waitingForReplace}
              className="input-s"
              data-testid="csv-timeframe"
            >
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label={t('csv.offset')} hint={t('csv.offset.hint')}>
            <input
              type="number"
              step={1}
              min={-MAX_OFFSET_HOURS}
              max={MAX_OFFSET_HOURS}
              value={offsetHours}
              onChange={(e) => setOffsetHours(e.target.value === '' ? Number.NaN : Number(e.target.value))}
              disabled={busy || waitingForReplace || offsetMode === 'row'}
              className="input-s"
              data-testid="csv-offset"
            />
          </InputField>
        </div>

        {phase === 'upload' && (
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="csv-progress">
            {t('csv.step.upload', { pct: Math.round(progress * 100) })}
          </p>
        )}
        {phase === 'check' && <p className="text-sm text-muted-foreground">{t('csv.step.check')}</p>}

        {failure && lineErrors.length === 0 && <Alert tone="danger" title={t('csv.failed')}>{failure}</Alert>}
        {lineErrors.length > 0 && (
          <Alert tone="danger" title={t('csv.errors.title', { count: lineErrors.length })}>
            <ul className="mt-1 space-y-0.5 font-mono text-xs" data-testid="csv-errors">
              {lineErrors.map((e) => (
                <li key={`${e.line}-${e.message}`}>{t('csv.errors.line', { line: e.line, message: e.message })}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">{t('csv.errors.advice')}</p>
          </Alert>
        )}
        {waitingForReplace && (
          <Alert tone="warning" title={t('csv.overlap.title')}>
            <p>{t('csv.overlap.text')}</p>
          </Alert>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" hint={t('csv.cancel.hint')} onClick={() => void close()} disabled={phase === 'check'}>
            {t('csv.cancel')}
          </Button>
          {waitingForReplace ? (
            <Button
              variant="danger"
              hint={t('csv.replace.hint')}
              onClick={() => void run(true)}
              loading={busy}
              data-testid="csv-replace"
            >
              {t('csv.replace')}
            </Button>
          ) : (
            <Button
              variant="primary"
              hint={t('csv.submit.hint')}
              onClick={() => void run(false)}
              disabled={!canSubmit}
              loading={busy}
              data-testid="csv-submit"
            >
              {t('csv.submit')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
