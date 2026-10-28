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
import { Card } from '@/components/ui/card';
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

  const formName = t(`formation.form.${form}` as MessageKey);

  const body = () => {
    if (!accountId) {
      return (
        <Alert tone="info" title={t('analysis.noAccount.title')}>
          {t('analysis.noAccount.text')}
        </Alert>
      );
    }
    if (!accountKnown) {
      return (
        accounts.length > 0 && (
          <Alert tone="warning" title={t('analysis.noAccount.title')}>
            {t('analysis.account.notFound', { id: accountId })}
          </Alert>
        )
      );
    }
    if (zones && !symbol) {
      return (
        <Alert tone="info" title={t('formation.noSymbol.title')}>
          {t('formation.noSymbol.text')}
        </Alert>
      );
    }
    if (scan.error) {
      return (
        <Alert tone="danger" title={t('formation.scan.failed')}>
          {scan.error}
        </Alert>
      );
    }
    return (
      <>
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
        {scan.loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status" data-testid="formation-loading">
            <Loader2 size={14} className="animate-spin" /> {t('formation.scan.loading')}
          </p>
        )}
        <div className="grid items-start gap-3.5 min-[900px]:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="min-w-0 p-2.5">
            {hit && scan.context && scan.scanAt !== null ? (
              <>
                <FormationChart hit={hit} context={scan.context} scanAt={scan.scanAt} digits={scan.digits} active={active} onActive={setActive} />
                <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-1 pt-1.5 text-xs text-muted-foreground" data-testid="formation-legend">
                  <li>{t('formation.legend.zigzag', { points: Object.keys(hit.candidate.points).join('–') })}</li>
                  <li>{t('formation.legend.ratio')}</li>
                  <li>{t('formation.legend.target', { point: FINAL_POINT[hit.form] })}</li>
                  <li>{t('formation.legend.zone')}</li>
                  <li>{t('formation.legend.rsi')}</li>
                </ul>
              </>
            ) : (
              <div className="grid h-[460px] place-items-center p-4 text-center text-sm text-muted-foreground" data-testid="formation-empty">
                {!scan.loading && t('formation.empty.chart', { form: formName, tf })}
              </div>
            )}
          </Card>
          <div className="flex min-w-0 flex-col gap-3">
            <Card>
              {list.length > 0 ? (
                <CandidateList hits={list} selected={hit} onSelect={(h) => setPicked(`${h.form}-${h.tf}`)} />
              ) : (
                <p className="px-2.5 py-2 text-sm text-muted-foreground" data-testid="candidate-empty">
                  {scan.loading ? t('formation.scan.loading') : t('formation.empty.list', { tf })}
                </p>
              )}
            </Card>
            <Card>
              {hit ? (
                <FormationChecklist hit={hit} active={active} onActive={setActive} />
              ) : (
                <div className="flex flex-col gap-2 p-3">
                  <strong className="text-[15px]">
                    {formName} · {tf}
                  </strong>
                  {!scan.loading && (
                    <p className="rounded-lg border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">{t('formation.empty.text', { tf })}</p>
                  )}
                </div>
              )}
            </Card>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="w-full space-y-5 px-4 py-6 md:px-8 md:py-8" data-testid="formation-page" data-scan-ms={scan.scanMs ?? ''}>
      <header>
        <p className="mb-2 text-xs text-muted-foreground">{t('formation.eyebrow')}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('formation.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('formation.subtitle')}</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto">
          <AccountDropdown
            accounts={accounts}
            selectedAccount={accountId}
            activeAccount={activeAccount}
            onSelect={(id) => {
              if (id !== accountId) setAccount(id);
            }}
          />
        </div>
        {accountKnown && (
          <div className="w-full sm:w-auto">
            <ZoneSelect zones={zones} value={zoneId} onChange={setZone} />
          </div>
        )}
      </div>
      {accountKnown && settingsError && (
        <Alert tone="danger" title={t('analysis.zone.failed')}>
          {settingsError}
        </Alert>
      )}
      {body()}
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
