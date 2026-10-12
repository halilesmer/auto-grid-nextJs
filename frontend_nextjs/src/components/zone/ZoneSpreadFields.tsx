'use client';

import { useEffect, useState } from 'react';
import type { ZoneSettings } from '@/store/types';
import type { FieldUpdateFn } from './types';
import type { SpreadGuardSettings, SpreadGuardStatus } from '@/lib/spreadGuardSettings';
import { InputField } from '@/components/ui/InputField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Switch } from '@/components/ui/switch';
import { SectionLabel } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFormat, useT } from '@/i18n';

export function ZoneSpreadFields({ zone, update, status, connected }: {
  zone: ZoneSettings;
  update: FieldUpdateFn;
  status?: SpreadGuardStatus;
  connected?: boolean;
}) {
  const t = useT();
  const fmt = useFormat();
  const [now, setNow] = useState(0);
  const cfg: SpreadGuardSettings = zone.spread_guard ?? { enabled: false, mode: 'fixed', bootstrap: 'wait' };
  useEffect(() => {
    if (!cfg.enabled || !status) return;
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, [cfg.enabled, status]);
  const set = (fields: Partial<SpreadGuardSettings>) => update('spread_guard', { ...cfg, ...fields });
  const numberField = (field: 'max_spread' | 'multiplier' | 'grid_percent' | 'initial_spread') => (
    <InputField label={t(`spread.${field}`)} hint={t(`spread.${field}.hint`)}>
      <NumberInput value={cfg[field]} min={0} step="any" maxDecimals={8}
        className="w-32 max-w-full" data-testid={`spread-${field}`} aria-label={t(`spread.${field}`)}
        onChange={(e) => set({ [field]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </InputField>
  );
  const modes = zone.entry_mode === 'fractal' ? ['fixed', 'relative'] as const : ['fixed', 'relative', 'grid'] as const;
  const stale = !connected || !status || (now > 0 && now - status.updated_at > 60);
  let tone: 'neutral' | 'warning' | 'success' = 'neutral';
  if (!stale) tone = status.blocked ? 'warning' : 'success';
  const reason = stale ? 'unavailable' : status.reason;
  const value = (v: number | null | undefined) => v == null || stale ? '—' : fmt.number(v, { maximumFractionDigits: 8 });
  return (
    <section className="min-w-0 space-y-3" data-testid="spread-guard" data-tooltip-scope>
      <SectionLabel>{t('spread.title')}</SectionLabel>
      <Switch checked={cfg.enabled} onChange={(enabled) => set({ enabled })}
        label={t('spread.enabled')} hint={t('spread.enabled.hint')} />
      {cfg.enabled && <>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <InputField label={t('spread.mode')} hint={t('spread.mode.hint')}>
            <select value={cfg.mode} data-testid="spread-mode" onChange={(e) => {
              const mode = modes.find((m) => m === e.target.value);
              if (mode) set({ mode, bootstrap: cfg.bootstrap ?? 'wait' });
            }}>
              {modes.map((mode) => <option key={mode} value={mode}>{t(`spread.mode.${mode}`)}</option>)}
            </select>
          </InputField>
          {cfg.mode === 'fixed' && numberField('max_spread')}
          {cfg.mode === 'grid' && numberField('grid_percent')}
          {cfg.mode === 'relative' && <>
            {numberField('multiplier')}
            <InputField label={t('spread.bootstrap')} hint={t('spread.bootstrap.hint')}>
              <select value={cfg.bootstrap ?? 'wait'} data-testid="spread-bootstrap" onChange={(e) => {
                if (e.target.value === 'wait' || e.target.value === 'manual') set({ bootstrap: e.target.value });
              }}>
                <option value="wait">{t('spread.bootstrap.wait')}</option>
                <option value="manual">{t('spread.bootstrap.manual')}</option>
              </select>
            </InputField>
            {cfg.bootstrap === 'manual' && numberField('initial_spread')}
          </>}
        </div>
        {connected !== undefined && <div className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/30 p-3" data-testid="spread-status">
          <Badge tone={tone} hint={t('spread.status.hint')}>{t(`spread.reason.${reason}`)}</Badge>
          <p className="break-words text-xs tabular-nums text-muted-foreground">
            {t('spread.values', { spread: value(status?.spread), limit: value(status?.limit) })}
          </p>
          {cfg.mode === 'relative' && <p className="text-xs tabular-nums text-muted-foreground">
            {t('spread.learning', { samples: stale ? '—' : fmt.number(status?.samples ?? 0), reference: value(status?.reference) })}
          </p>}
        </div>}
        <p className="text-xs text-muted-foreground">{t('spread.recovery')}</p>
      </>}
    </section>
  );
}
