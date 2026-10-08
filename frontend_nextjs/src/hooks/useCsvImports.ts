'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/animated-toast';
import { useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { listCsvImports, type CsvImport } from '@/services/csvImportApi';

/**
 * CSV-Importe eines Kontos (BKT-05): die Liste im CsvImportPanel und die Auswahl der Datenquelle im Lauf (B5b) lesen
 * dieselbe Ladung. Nur für die Backtest-Seite, deshalb lokaler Zustand statt Store. `null` = lädt oder Ladefehler.
 */
export function useCsvImports(accountId: string | null) {
  const t = useT();
  // Die Liste merkt sich ihr Konto: nach einem Kontowechsel gilt die alte Liste nicht, bis die neue da ist
  const [loaded, setLoaded] = useState<{ accountId: string; imports: CsvImport[] } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    listCsvImports(accountId)
      .then((imports) => !cancelled && setLoaded({ accountId, imports }))
      .catch(async (err: unknown) => {
        if (cancelled) return;
        // Ladefehler ist nicht „keine Importe“: eine frühere Liste desselben Kontos bleibt, sonst fiele eine gewählte
        // CSV-Quelle still auf den MT5-Server zurück
        setLoaded((prev) => (prev?.accountId === accountId ? prev : null));
        toast.error(await getApiErrorMessage(err, t('csv.failed')));
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, version, t]);

  return { imports: loaded && loaded.accountId === accountId ? loaded.imports : null, reload };
}
