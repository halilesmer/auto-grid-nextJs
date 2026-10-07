'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/animated-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useFormat, useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { deleteCsvImport, listCsvImports, type CsvImport } from '@/services/csvImportApi';
import { CsvImportDialog } from './CsvImportDialog';

/**
 * Liste der CSV-Importe des Kontos im Backtest-Tab (BKT-05). Nur abgeschlossene Importe sind als Datenquelle
 * wählbar (Auswahl kommt mit der Backtest-Seite, B5); unfertige sind markiert und nur löschbar.
 */
export function CsvImportPanel({ accountId, defaultSymbol }: { accountId: string; defaultSymbol: string }) {
  const t = useT();
  const fmt = useFormat();
  const [imports, setImports] = useState<CsvImport[] | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [open, setOpen] = useState(false);

  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    listCsvImports(accountId)
      .then((list) => !cancelled && setImports(list))
      .catch(async (err: unknown) => {
        if (cancelled) return;
        setImports(null); // Ladefehler ist nicht „keine Importe“
        toast.error(await getApiErrorMessage(err, t('csv.failed')));
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, version, t]);

  const remove = async (item: CsvImport) => {
    try {
      await deleteCsvImport(accountId, item.import_id);
    } catch (err) {
      toast.error(await getApiErrorMessage(err, t('csv.failed')));
    }
    reload();
  };

  const openDialog = () => {
    setDialogKey((k) => k + 1); // frischer Zustand bei jedem Öffnen
    setOpen(true);
  };

  return (
    <Card data-testid="csv-panel">
      <CardHeader
        icon={<FileUp size={16} />}
        title={t('csv.title')}
        description={t('csv.subtitle')}
        actions={
          <Button size="sm" variant="secondary" hint={t('csv.import.hint')} onClick={openDialog} data-testid="csv-open">
            {t('csv.import')}
          </Button>
        }
      />
      <div className="space-y-2 px-5 pb-5 pt-4">
        {imports?.length === 0 && <p className="text-sm text-muted-foreground">{t('csv.empty')}</p>}
        {imports?.map((item) => (
          <div
            key={item.import_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            data-testid="csv-item"
            data-status={item.status}
          >
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {item.symbol} · {item.timeframe}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{item.filename}</span>
              </p>
              {item.status === 'committed' && item.first_t !== null && item.last_t !== null ? (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t('csv.item.range', {
                    from: fmt.mt5DateTime(item.first_t),
                    to: fmt.mt5DateTime(item.last_t),
                    bars: fmt.number(item.bars ?? 0),
                  })}
                  {item.gaps ? ` · ${t('csv.item.gaps', { count: item.gaps })}` : ''}
                </p>
              ) : (
                <Badge tone="warning" hint={t('csv.item.unfinished.hint')}>
                  {t('csv.item.unfinished')}
                </Badge>
              )}
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              hint={t('csv.delete.hint')}
              aria-label={t('csv.delete.aria', { symbol: item.symbol, tf: item.timeframe })}
              onClick={() => void remove(item)}
              data-testid="csv-delete"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      <CsvImportDialog
        key={dialogKey}
        open={open}
        accountId={accountId}
        defaultSymbol={defaultSymbol}
        onClose={() => {
          setOpen(false);
          reload();
        }}
        onImported={() => void reload()}
      />
    </Card>
  );
}
