'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { AccountDropdown } from '@/components/account/components';
import { useAccounts } from '@/components/account/hooks';
import { ZoneSelect } from '@/components/analysis/ZoneSelect';
import { CandidateList } from '@/components/formation/CandidateList';
import { FormationChart } from '@/components/formation/FormationChart';
import { FormationChecklist } from '@/components/formation/FormationChecklist';
import { FormationToolbar } from '@/components/formation/FormationToolbar';
import { Alert } from '@/components/ui/alert';
import { FormationDetailsPanel } from '@/components/formation/FormationDetailsPanel';
import { useAccountSettings } from '@/hooks/useAccountSettings';
import { useBrokerClock } from '@/hooks/useBrokerClock';
import { useFormationParams } from '@/hooks/useFormationParams';
import { useFormationScan } from '@/hooks/useFormationScan';
import { useT, type MessageKey } from '@/i18n';
import { FINAL_POINT, timeframeForForm } from '@/lib/formation/scan';
import { selectAccount, useAccountStore, useSettingsStore } from '@/store';

/**
 * Formationserkennung (/formasyon): Konto und Setup bestimmen das Symbol; im Hintergrund läuft die Suche über alle
 * Formationen und Zeiteinheiten (useFormationScan). Chart, Kandidaten-Liste und Checkliste zeigen den gewählten Kandidaten.
 */
function FormationView() {
  const t = useT();
  const { accountId: urlAccount, zoneId: urlZone, tf, form, setAccount, setZone, setView } = useFormationParams();
  const accounts = useAccountStore((s) => s.accounts);
  const selected = useAccountStore((s) => s.selectedAccount);
  const activeAccount = useAccountStore((s) => s.activeAccount);
  const settings = useSettingsStore((s) => s.settings);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const { fetchAccounts } = useAccounts();

  const accountId = urlAccount ?? selected;
  const accountKnown = accounts.some((a) => String(a.id) === accountId);

  useEffect(() => {
    if (useAccountStore.getState().accounts.length === 0) fetchAccounts();
  }, [fetchAccounts]);

  // Ein Konto aus der Adresse wird global gewählt (wie auf /chart); ohne ?account= gilt das gewählte Konto, die Adresse bleibt sauber
  useEffect(() => {
    if (urlAccount && accountKnown && urlAccount !== useAccountStore.getState().selectedAccount) selectAccount(urlAccount);
  }, [urlAccount, accountKnown]);

  const settingsError = useAccountSettings(accountKnown ? accountId : null, 'ifMissing');
  const zones = useMemo(
    () => (accountId && loadedAccount === accountId && settings ? (settings.ZONES ?? []) : null),
    [accountId, loadedAccount, settings],
  );
  // Ohne ?zone= gilt die erste Zone des Kontos
  const zoneId = urlZone ?? zones?.[0]?.id ?? null;

  const zone = zones?.find((z) => z.id === zoneId) ?? null;
  const symbol = zone?.symbol?.toUpperCase().trim() || null;

  const clock = useBrokerClock(accountKnown ? accountId : null);
  const offsetSec = clock.clock?.reliable ? clock.clock.offset_sec : null;
  const scan = useFormationScan(accountKnown ? accountId : null, symbol, offsetSec, !clock.loading);

  const list = useMemo(() => scan.hits.filter((h) => h.form === form && h.tf === tf), [scan.hits, form, tf]);
  const [pickedTf, setPicked] = useState<string | null>(null);
  const hit = list.find((h) => `${h.form}-${h.tf}` === pickedTf) ?? list[0] ?? null;
  const [active, setActive] = useState<string[] | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const formName = t(`formation.form.${form}` as MessageKey);

  const body = () => {
    if (!accountId) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="info" title={t('analysis.noAccount.title')}>
          {t('analysis.noAccount.text')}
        </Alert>
      );
    }
    if (!accountKnown) {
      return (
        accounts.length > 0 && (
          <Alert className="absolute left-3 right-20 top-64 bg-background" tone="warning" title={t('analysis.noAccount.title')}>
            {t('analysis.account.notFound', { id: accountId })}
          </Alert>
        )
      );
    }
    if (zones && !symbol) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="info" title={t('formation.noSymbol.title')}>
          {t('formation.noSymbol.text')}
        </Alert>
      );
    }
    if (scan.error) {
      return (
        <Alert className="absolute left-3 right-20 top-64 bg-background" tone="danger" title={t('formation.scan.failed')}>
          {scan.error}
        </Alert>
      );
    }
    return hit && scan.context && scan.scanAt !== null ? (
      <FormationChart accountId={accountId} hit={hit} context={scan.context} scanAt={scan.scanAt} digits={scan.digits} active={active} onActive={setActive} />
    ) : (
      <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground" data-testid="formation-empty">
        {!scan.loading && t('formation.empty.chart', { form: formName, tf })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-20 overflow-hidden bg-card lg:top-(--nav-height)" data-testid="formation-page" data-scan-ms={scan.scanMs ?? ''}>
      <h1 className="sr-only">{t('formation.title')}</h1>
      <div className="absolute inset-0" data-testid="formation-surface">
        {body()}
      </div>
      <div className="pointer-events-none absolute left-[64px] right-3 top-20 z-30 flex min-w-0 flex-col items-start gap-2 sm:right-20 lg:top-3">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-2 shadow-lg backdrop-blur-md" data-testid="formation-selectors">
          <AccountDropdown
            accounts={accounts}
            selectedAccount={accountId}
            activeAccount={activeAccount}
            onSelect={(id) => {
              if (id !== accountId) setAccount(id);
            }}
          />
          {accountKnown && <ZoneSelect zones={zones} value={zoneId} onChange={setZone} />}
        </div>
        <div className="pointer-events-auto max-w-full">
          <FormationToolbar
            hits={scan.hits}
            tf={tf}
            form={form}
            onTimeframe={(next) => {
              setActive(null);
              setView({ tf: next });
            }}
            onForm={(next) => {
              setActive(null);
              setView({ form: next, tf: timeframeForForm(scan.hits, next, tf) });
            }}
          />
        </div>
        {scan.loading && (
          <p className="flex items-center gap-2 rounded-lg bg-background/95 p-2 text-xs text-muted-foreground" role="status" data-testid="formation-loading">
            <Loader2 size={14} className="animate-spin" /> {t('formation.scan.loading')}
          </p>
        )}
        {accountKnown && settingsError && (
          <div className="pointer-events-auto max-w-md">
            <Alert tone="danger" title={t('analysis.zone.failed')}>{settingsError}</Alert>
          </div>
        )}
      </div>
      <FormationDetailsPanel
        title={`${formName} · ${tf}`}
        open={detailsOpen}
        onToggle={() => {
          setActive(null);
          setDetailsOpen(!detailsOpen);
        }}
      >
        {list.length > 0 ? (
          <CandidateList hits={list} selected={hit} onSelect={(h) => setPicked(`${h.form}-${h.tf}`)} />
        ) : (
          <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="candidate-empty">
            {scan.loading ? t('formation.scan.loading') : t('formation.empty.list', { tf })}
          </p>
        )}
        {hit ? (
          <FormationChecklist hit={hit} active={active} onActive={setActive} />
        ) : !scan.loading && (
          <p className="p-3 text-xs text-muted-foreground">{t('formation.empty.text', { tf })}</p>
        )}
      </FormationDetailsPanel>
      {hit && (
        <ul className="pointer-events-none absolute bottom-[20%] left-[64px] right-20 z-10 hidden w-fit max-w-[calc(100%-6rem)] flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground min-[900px]:flex" data-testid="formation-legend">
          <li>{t('formation.legend.zigzag', { points: Object.keys(hit.candidate.points).join('–') })}</li>
          <li>{t('formation.legend.ratio')}</li>
          <li>{t('formation.legend.target', { point: FINAL_POINT[hit.form] })}</li>
          <li>{t('formation.legend.zone')}</li>
          <li>{t('formation.legend.rsi')}</li>
        </ul>
      )}
    </div>
  );
}

export default function FormasyonPage() {
  // useSearchParams braucht eine Suspense-Grenze, sonst schlägt der Produktions-Build fehl
  return (
    <Suspense fallback={<div className="min-h-125" />}>
      <FormationView />
    </Suspense>
  );
}
