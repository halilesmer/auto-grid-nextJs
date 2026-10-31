'use client';

import { Bell, BellOff, X } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import type { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { SCAN_FORMATIONS } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

type Alarm = ReturnType<typeof useFormationAlarm>;

/**
 * Glocke in der Kopfleiste neben dem Bild-Knopf: Menü mit Stand des Alarms, den Schaltern „Alle Favoriten“ und „Alarm für
 * <Produkt>“, den weiteren Alarm-Produkten, den Ereignissen, den Formationen und den Kanälen. Das Banner sagt dauerhaft,
 * dass der Alarm auf jeder Seite läuft, solange die App offen ist. Ohne bekanntes Konto (`accountKnown` false) ist der Knopf aus.
 */
export function FormationAlarmMenu({ symbol, accountKnown, alarm }: { symbol: string | null; accountKnown: boolean; alarm: Alarm }) {
  const t = useT();
  const fmt = useFormat();
  const { prefs, enabled, favoritesEnabled, extras, status, permission } = alarm;
  const active = status.total > 0;
  const incomplete = status.incomplete.length > 0;
  const activeDot = incomplete ? 'bg-warning' : 'bg-success';
  const dot = active ? activeDot : 'bg-muted-foreground';
  const icon = (
    <span className="relative inline-flex">
      {active ? <Bell size={16} /> : <BellOff size={16} />}
      {active && <span className={cn('absolute -right-1 -top-1 size-2 rounded-full border border-background', dot)} aria-hidden="true" />}
    </span>
  );
  const blocked = permission === 'denied';
  const statusText = !active
    ? t('formation.alarm.status.off')
    : t(status.lastRunAt === null ? 'formation.alarm.status.running' : 'formation.alarm.status.active', { time: status.lastRunAt === null ? '' : fmt.time(status.lastRunAt), ready: status.ready, total: status.total });
  return (
    <DropdownMenu
      label={t('formation.alarm.menu')}
      hint={accountKnown ? t('formation.alarm.menu.hint') : t('formation.alarm.menu.empty.hint')}
      icon={icon}
      variant="ghost"
      size="icon-sm"
      align="left"
      className="max-lg:mr-1"
      panelClassName="w-80 max-w-[calc(100vw-1rem)]"
      triggerProps={{ disabled: !accountKnown, 'data-testid': 'formation-alarm', 'data-enabled': String(active) }}
    >
      <div className="flex flex-col gap-3 p-3" data-testid="formation-alarm-panel">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{t('formation.alarm.menu')}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums" data-testid="formation-alarm-status">
            <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
            {statusText}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <Switch
            id="formation-alarm-favorites"
            checked={favoritesEnabled}
            onChange={alarm.setFavorites}
            label={t('formation.alarm.favorites')}
            description={t('formation.alarm.favorites.note', { count: alarm.favoriteCount })}
            hint={t('formation.alarm.favorites.hint')}
          />
          <Switch
            id="formation-alarm-enabled"
            checked={enabled}
            onChange={alarm.setEnabled}
            disabled={!symbol}
            label={t('formation.alarm.enable', { symbol: symbol ?? '' })}
            hint={t('formation.alarm.enable.hint')}
          />
        </div>
        {extras.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{t('formation.alarm.extras')}</span>
            <div className="flex flex-wrap gap-1">
              {extras.map((extra) => (
                <Tooltip key={extra} content={t('formation.alarm.extra.remove.hint')} role="presentation">
                  <button
                    type="button"
                    aria-label={t('formation.alarm.extra.remove', { symbol: extra })}
                    data-testid={`formation-alarm-extra-${extra}`}
                    onClick={() => alarm.removeExtra(extra)}
                    className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-[5px] border border-border px-1.5 text-xs hover:bg-accent"
                  >
                    {extra}
                    <X size={11} aria-hidden="true" />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        <p className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5 text-xs text-foreground" data-testid="formation-alarm-banner">
          {t('formation.alarm.pageOnly')}
        </p>
        {incomplete && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-foreground" data-testid="formation-alarm-incomplete">
            {t('formation.alarm.incomplete', { symbols: status.incomplete.join(', ') })}
          </p>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">{t('formation.alarm.events')}</legend>
          <Switch id="formation-alarm-valid" checked={prefs.events.valid} onChange={(on) => alarm.setEvent('valid', on)} label={t('formation.alarm.event.valid')} hint={t('formation.alarm.event.valid.hint')} />
          <Switch id="formation-alarm-target" checked={prefs.events.target} onChange={(on) => alarm.setEvent('target', on)} label={t('formation.alarm.event.target')} hint={t('formation.alarm.event.target.hint')} />
        </fieldset>
        <div role="group" aria-label={t('formation.alarm.forms')} className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t('formation.alarm.forms')}</span>
          <div className="flex flex-wrap gap-1">
            {SCAN_FORMATIONS.map((form) => {
              const name = t(`formation.form.${form}` as MessageKey);
              const on = prefs.forms.includes(form);
              return (
                <Tooltip key={form} content={t('formation.alarm.form.option.hint', { form: name })} role="presentation">
                  <button
                    type="button"
                    aria-pressed={on}
                    data-testid={`formation-alarm-form-${form}`}
                    onClick={() => alarm.setForm(form, !on)}
                    className={cn('inline-flex h-6 cursor-pointer items-center rounded-[5px] px-1.5 text-xs transition-colors', on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}
                  >
                    {name}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs text-muted-foreground">{t('formation.alarm.channels')}</legend>
          <Switch
            id="formation-alarm-system"
            checked={prefs.system && !blocked}
            onChange={alarm.setSystem}
            disabled={permission === 'unsupported' || blocked}
            label={t('formation.alarm.channel.system')}
            hint={t('formation.alarm.channel.system.hint')}
          />
          {blocked && <p className="text-xs text-muted-foreground" data-testid="formation-alarm-blocked">{t('formation.alarm.system.blocked')}</p>}
          <Switch id="formation-alarm-sound" checked={prefs.sound} onChange={alarm.setSound} label={t('formation.alarm.channel.sound')} hint={t('formation.alarm.channel.sound.hint')} />
        </fieldset>
      </div>
    </DropdownMenu>
  );
}
