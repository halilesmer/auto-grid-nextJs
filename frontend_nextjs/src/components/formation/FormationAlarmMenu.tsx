'use client';

import { Bell, BellOff } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import type { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useT, type MessageKey } from '@/i18n';
import { SCAN_FORMATIONS } from '@/lib/formation/scan';
import { cn } from '@/lib/utils';

type Alarm = ReturnType<typeof useFormationAlarm>;

/**
 * Glocke in der Kopfleiste neben dem Bild-Knopf: Menü mit Schalter für das Symbol, den Ereignissen, den Formationen
 * und den Kanälen. Das Banner im Menü sagt dauerhaft, dass der Alarm nur bei offener Seite läuft.
 * Ohne Symbol (`symbol` null) ist der Knopf aus.
 */
export function FormationAlarmMenu({ symbol, alarm }: { symbol: string | null; alarm: Alarm }) {
  const t = useT();
  const { prefs, enabled, permission } = alarm;
  const icon = (
    <span className="relative inline-flex">
      {enabled ? <Bell size={16} /> : <BellOff size={16} />}
      {enabled && <span className="absolute -right-1 -top-1 size-2 rounded-full border border-background bg-success" aria-hidden="true" />}
    </span>
  );
  const blocked = permission === 'denied';
  return (
    <DropdownMenu
      label={t('formation.alarm.menu')}
      hint={symbol ? t('formation.alarm.menu.hint') : t('formation.alarm.menu.empty.hint')}
      icon={icon}
      variant="ghost"
      size="icon-sm"
      align="left"
      className="max-lg:mr-1"
      panelClassName="w-72 max-w-[calc(100vw-1rem)]"
      triggerProps={{ disabled: !symbol, 'data-testid': 'formation-alarm', 'data-enabled': String(enabled) }}
    >
      <div className="flex flex-col gap-3 p-3" data-testid="formation-alarm-panel">
        <Switch
          id="formation-alarm-enabled"
          checked={enabled}
          onChange={alarm.setEnabled}
          label={t('formation.alarm.enable', { symbol: symbol ?? '' })}
          hint={t('formation.alarm.enable.hint')}
        />
        <p className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5 text-xs text-foreground" data-testid="formation-alarm-banner">
          {t('formation.alarm.pageOnly')}
        </p>
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
