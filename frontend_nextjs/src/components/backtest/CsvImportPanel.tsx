'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, FileUp, Server, Trash2, X } from 'lucide-react';
import { toast } from '@/components/ui/animated-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import ConfirmModal from '@/components/ConfirmModal';
import { useFormat, useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { deleteCsvImport, type CsvImport, type CsvSeries } from '@/services/csvImportApi';
import { useAccountStore } from '@/store/useAccountStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CsvImportDialog } from './CsvImportDialog';

interface CsvImportPanelProps {
  accountId: string;
  defaultSymbol: string;
  /** Dateien aus useCsvImports (die Seite teilt sie mit der Auswahl der Datenquelle); null = lädt oder Ladefehler */
  imports: CsvImport[] | null;
  /** Serien (Server + Symbol + Zeitrahmen) aus derselben Ladung */
  series: CsvSeries[] | null;
  reload: () => void;
}

/**
 * Serien der CSV-Importe auf /backtest (BKT-05, 1107-A5.2/A6.2): eine Zeile je Server + Symbol + Zeitrahmen, darunter
 * auf Wunsch die Dateien. Eine neue Datei verlängert die Serie, sie löscht nie eine alte. Nur der Admin löscht eine
 * fertige Datei (mit Bestätigung); ein unfertiger Upload ist markiert und von seinem Konto abbrechbar.
 * Nur Serien sind im Lauf als Datenquelle wählbar (RunSettings, B5b).
 */
export function CsvImportPanel({ accountId, defaultSymbol, imports, series, reload }: CsvImportPanelProps) {
  const t = useT();
  const fmt = useFormat();
  const me = useAuthStore((s) => s.me);
  const isAdmin = me?.role === 'admin';
  const account = useAccountStore((s) => s.accounts.find((a) => String(a.id) === accountId));
  const [dialogKey, setDialogKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<CsvImport | null>(null);

  const files = (item: CsvSeries) =>
    (imports ?? []).filter((f) => f.status === 'committed' && item.import_ids.includes(f.import_id));
  const unfinished = (imports ?? []).filter((f) => f.status === 'staging');

  const remove = async (item: CsvImport) => {
    try {
      await deleteCsvImport(accountId, item.import_id);
    } catch (err) {
      toast.error(await getApiErrorMessage(err, t('csv.failed')));
    }
    reload();
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const openDialog = () => {
    setDialogKey((k) => k + 1); // frischer Zustand bei jedem Öffnen
    setOpen(true);
  };

  const seriesName = (item: { symbol: string; timeframe: string }) => `${item.symbol} · ${item.timeframe}`;
  const deleting = pendingDelete;

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
        {series?.map((item) => {
          const shown = expanded.has(item.import_id);
          return (
            <div
              key={item.import_id}
              className="rounded-lg border border-border px-3 py-2"
              data-testid="csv-series"
              data-files={item.files}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{seriesName(item)}</span>
                    <span className="text-xs font-normal text-muted-foreground">{t('csv.series.files', { count: item.files })}</span>
                    {item.server && (
                      <Badge tone="info" hint={t('csv.series.server.hint')} data-testid="csv-series-server">
                        <Server size={11} className="mr-1 inline" aria-hidden />
                        {item.server}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground" data-testid="csv-series-range">
                    {t('csv.series.range', {
                      from: fmt.mt5DateTime(item.first_t),
                      to: fmt.mt5DateTime(item.last_t),
                      bars: fmt.number(item.bars),
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  hint={t('csv.series.files.hint')}
                  aria-expanded={shown}
                  onClick={() => toggle(item.import_id)}
                  data-testid="csv-series-toggle"
                >
                  {shown ? t('csv.series.hide') : t('csv.series.files')}
                  {shown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
              </div>
              {shown && (
                <ul className="mt-2 space-y-1.5 border-t border-border pt-2" data-testid="csv-series-files">
                  {files(item).map((file) => (
                    <li
                      key={file.import_id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      data-testid="csv-item"
                      data-status={file.status}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{file.filename}</p>
                        {file.first_t !== null && file.last_t !== null && (
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {t('csv.item.range', {
                              from: fmt.mt5DateTime(file.first_t),
                              to: fmt.mt5DateTime(file.last_t),
                              bars: fmt.number(file.bars ?? 0),
                            })}
                            {file.gaps ? ` · ${t('csv.item.gaps', { count: file.gaps })}` : ''}
                          </p>
                        )}
                        {file.offset_mode === 'row' && (
                          <Badge tone="info" hint={t('csv.item.rowOffset.hint')} data-testid="csv-row-offset">
                            {t('csv.item.rowOffset')}
                          </Badge>
                        )}
                      </div>
                      {isAdmin && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          hint={t('csv.delete.hint')}
                          aria-label={t('csv.delete.aria', { symbol: file.symbol, tf: file.timeframe })}
                          onClick={() => setPendingDelete(file)}
                          data-testid="csv-delete"
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </li>
                  ))}
                  {me && !isAdmin && ( // erst wenn die Rolle bekannt ist: sonst blitzt der Hinweis beim Admin kurz auf
                    <li className="text-xs text-muted-foreground" data-testid="csv-admin-only">
                      {t('csv.delete.adminOnly')}
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
        {unfinished.map((file) => (
          <div
            key={file.import_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            data-testid="csv-item"
            data-status={file.status}
          >
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {seriesName(file)}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{file.filename}</span>
              </p>
              <Badge tone="warning" hint={t('csv.item.unfinished.hint')}>
                {t('csv.item.unfinished')}
              </Badge>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              hint={t('csv.discard.hint')}
              aria-label={t('csv.discard.aria', { symbol: file.symbol, tf: file.timeframe })}
              onClick={() => void remove(file)}
              data-testid="csv-delete"
            >
              <X size={14} />
            </Button>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting);
          setPendingDelete(null);
        }}
        title={t('csv.delete.title')}
        message={deleting ? t('csv.delete.text', { file: deleting.filename, series: seriesName(deleting) }) : ''}
        infoText={
          deleting
            ? t('csv.delete.account', {
                mode: account?.env_type ?? '—',
                server: deleting.server ?? account?.server ?? '—',
              })
            : undefined
        }
        variant="danger"
        confirmLabel={t('csv.delete.confirm')}
        confirmHint={t('csv.delete.confirm.hint')}
      />
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
