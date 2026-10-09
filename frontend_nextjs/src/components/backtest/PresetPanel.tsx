'use client';

import { useEffect, useRef, useState } from 'react';
import ConfirmModal from '@/components/ConfirmModal';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { useT } from '@/i18n';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import { dataForPreset, setupFromPreset, type BacktestPreset } from '@/lib/backtest/presets';
import * as api from '@/services/backtestPresetApi';
import { useAuthStore } from '@/store/useAuthStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { MAX_SETUPS, useBacktestStore, type BacktestSetup } from '@/store/useBacktestStore';
import type { ZoneSettings } from '@/store/types';

export function PresetPanel({ saveSetup, onClose, onTransfer }: {
  saveSetup: BacktestSetup | null; onClose: () => void; onTransfer: (zone: ZoneSettings) => void;
}) {
  const t = useT();
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const apiKey = useConnectionStore((s) => s.apiKey);
  const owner = useAuthStore((s) => s.me?.id);
  const count = useBacktestStore((s) => s.setups.length);
  const scope = `${baseUrl}|${apiKey}|${owner}`;
  const [state, setState] = useState<{ scope: string; items: BacktestPreset[]; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [rename, setRename] = useState<BacktestPreset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BacktestPreset | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const creation = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = () => alive.current && useConnectionStore.getState().baseUrl === baseUrl
    && useConnectionStore.getState().apiKey === apiKey && useAuthStore.getState().me?.id === owner;

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    api.listPresets(controller.signal).then((items) => {
      if (!controller.signal.aborted) { setState({ scope, items, error: null }); setBusy(false); }
    }).catch(async (error) => {
      if (isAbortError(error)) return;
      const message = await getApiErrorMessage(error, t('backtest.presets.failed'));
      if (!controller.signal.aborted) { setState({ scope, items: [], error: message }); setBusy(false); }
    });
    return () => controller.abort();
  }, [scope, owner, attempt, t]);

  const ready = state?.scope === scope;
  const items = ready ? state.items : [];
  const execute = async (action: () => Promise<unknown>) => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      await action();
      if (!current()) return;
      const list = await api.listPresets();
      if (current()) setState({ scope, items: list, error: null });
    } catch (error) {
      const message = await getApiErrorMessage(error, t('backtest.presets.failed'));
      if (current()) setState((old) => ({ scope, items: old?.scope === scope ? old.items : [], error: message }));
    } finally {
      if (current()) setBusy(false);
    }
  };
  const canName = name.trim().length > 0 && name.trim().length <= 80;

  return <Modal open onClose={onClose} title={t('backtest.presets.title')} className="max-h-[90dvh] max-w-2xl overflow-y-auto">
    <div className="space-y-4" data-testid="bt-presets">
      <p className="text-sm text-muted-foreground">{t('backtest.presets.notice')}</p>
      {ready && state.error && <Alert tone="danger" title={state.error} />}
      {(rename || (saveSetup && !saved)) && <div className="space-y-2">
        <InputField label={t('backtest.presets.name')} hint={t('backtest.presets.name.hint')}>
          <input className="input-s" value={name} maxLength={80} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </InputField>
        <Button variant="primary" loading={busy} disabled={!ready || !canName || (items.length >= 100 && !rename)} hint={t('backtest.presets.save.hint')}
          onClick={() => void execute(async () => {
            if (rename) {
              await api.renamePreset(rename.id, name.trim());
              if (current()) setRename(null);
            } else if (saveSetup) {
              const data = dataForPreset(saveSetup);
              const fingerprint = JSON.stringify({ scope, name: name.trim(), data });
              if (creation.current?.fingerprint !== fingerprint) creation.current = { fingerprint, requestId: crypto.randomUUID() };
              await api.savePreset({ name: name.trim(), data, requestId: creation.current.requestId });
              if (current()) setSaved(true);
            }
            if (current()) setName('');
          })}>{t(rename ? 'backtest.presets.rename' : 'backtest.presets.save')}</Button>
      </div>}
      {saved && <Alert tone="info" title={t('backtest.presets.saved')} />}
      <Button variant="ghost" disabled={busy} hint={t('backtest.transfer.reload.hint')} onClick={() => setAttempt((a) => a + 1)}>{t('backtest.transfer.reload')}</Button>
      {ready && items.length === 0 && !state.error && <p className="text-sm text-muted-foreground">{t('backtest.presets.empty')}</p>}
      <ul className="space-y-3">{items.map((preset) => <li key={preset.id} className="space-y-2 rounded-lg border border-border p-3" data-testid="bt-preset">
        <p className="break-words font-medium">{preset.name}</p>
        <p className="text-xs text-muted-foreground">{preset.zone.symbol} · {preset.form.timeframe} · {preset.appVersion}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || count >= MAX_SETUPS} hint={t('backtest.presets.load.hint')} onClick={() => {
            if (useBacktestStore.getState().add(setupFromPreset(preset))) onClose();
          }}>{t('backtest.presets.load')}</Button>
          <Button size="sm" disabled={busy} hint={t('backtest.presets.rename.hint')} onClick={() => { setRename(preset); setName(preset.name); }}>{t('backtest.presets.rename')}</Button>
          <Button size="sm" disabled={busy} hint={t('backtest.transfer.apply.hint')} onClick={() => onTransfer(setupFromPreset(preset).zone)}>{t('backtest.transfer.title')}</Button>
          <Button size="sm" variant="danger" disabled={busy} hint={t('backtest.presets.delete.hint')} onClick={() => setDeleteTarget(preset)}>{t('backtest.presets.delete')}</Button>
        </div>
      </li>)}</ul>
      <ConfirmModal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} loading={busy}
        title={t('backtest.presets.delete')} message={t('backtest.presets.deleteMessage', { name: deleteTarget?.name ?? '' })}
        confirmHint={t('backtest.presets.delete.hint')} onConfirm={() => execute(async () => {
          if (!deleteTarget) return;
          await api.deletePreset(deleteTarget.id);
          if (current()) { setDeleteTarget(null); setRename((old) => old?.id === deleteTarget.id ? null : old); }
        })} />
    </div>
  </Modal>;
}
