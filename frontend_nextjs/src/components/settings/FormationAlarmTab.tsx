'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useT, type MessageKey } from '@/i18n';
import { SCAN_FORMATIONS } from '@/lib/formation/scan';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';
import { ChipToggle, SettingsRow } from './parts';

/**
 * Sekme „Formasyon alarmı“ (USR-15): kullanıcıya ait alarm tercihleri. Grafikteki alarm menüsüyle aynı depoyu
 * (`useFormationAlarm` → `alarmStore`) okur ve yazar; iki yerden yapılan değişiklik birbirini görür.
 * Hesaba ait alanlar (ürün anahtarları, favoriler, geçmiş) burada değil, grafikteki menüdedir.
 */
export default function FormationAlarmTab() {
  const t = useT();
  const alarm = useFormationAlarm(null, null);
  const { prefs, permission } = alarm;
  const blocked = permission === 'denied';
  const hide = () => useSettingsDialogStore.getState().hide();

  return (
    <div data-testid="settings-formation-alarm">
      <SettingsRow label={t('formation.alarm.menu')} desc={t('sdlg.fa.active.desc')} prefKey="formation_alarm" isNew testId="row-fa-active">
        <Switch id="settings-fa-active" checked={alarm.active} onChange={alarm.setActive} label={t(alarm.active ? 'formation.alarm.active' : 'formation.alarm.inactive')} hint={t('formation.alarm.active.hint')} />
      </SettingsRow>

      <SettingsRow label={t('sdlg.fa.events')} desc={t('sdlg.fa.events.desc')} prefKey="formation_alarm" testId="row-fa-events">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('sdlg.fa.events')}>
          <ChipToggle testId="settings-fa-event-valid" pressed={prefs.events.valid} label={t('formation.alarm.event.valid')} hint={t('formation.alarm.event.valid.hint')} onClick={() => alarm.setEvent('valid', !prefs.events.valid)} />
          <ChipToggle testId="settings-fa-event-target" pressed={prefs.events.target} label={t('formation.alarm.event.target')} hint={t('formation.alarm.event.target.hint')} onClick={() => alarm.setEvent('target', !prefs.events.target)} />
        </div>
      </SettingsRow>

      <SettingsRow label={t('formation.alarm.forms')} desc={t('sdlg.fa.forms.desc')} prefKey="formation_alarm" testId="row-fa-forms">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('formation.alarm.forms')}>
          {SCAN_FORMATIONS.map((form) => {
            const name = t(`formation.form.${form}` as MessageKey);
            return (
              <ChipToggle
                key={form}
                testId={`settings-fa-form-${form}`}
                pressed={prefs.forms.includes(form)}
                label={name}
                hint={t('formation.alarm.form.option.hint', { form: name })}
                onClick={() => alarm.setForm(form, !prefs.forms.includes(form))}
              />
            );
          })}
        </div>
      </SettingsRow>

      <SettingsRow label={t('formation.alarm.channels')} desc={t('sdlg.fa.channels.desc')} prefKey="formation_alarm" testId="row-fa-channels">
        <div className="flex flex-col gap-3">
          <Switch
            id="settings-fa-system"
            checked={prefs.system && !blocked}
            onChange={alarm.setSystem}
            disabled={permission === 'unsupported' || blocked}
            label={t('formation.alarm.channel.system')}
            hint={t('formation.alarm.channel.system.hint')}
          />
          {blocked && (
            <p className="text-xs text-muted-foreground" data-testid="settings-fa-blocked">
              {t('formation.alarm.system.blocked')}
            </p>
          )}
          <Switch id="settings-fa-sound" checked={prefs.sound} onChange={alarm.setSound} label={t('formation.alarm.channel.sound')} hint={t('formation.alarm.channel.sound.hint')} />
        </div>
      </SettingsRow>

      <SettingsRow label={t('sdlg.fa.products')} desc={t('sdlg.fa.products.desc')} testId="row-fa-products">
        <Tooltip content={t('sdlg.fa.open.hint')} className="self-start">
          <Link
            href="/chart"
            onClick={hide}
            data-testid="settings-fa-open"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9"
          >
            {t('sdlg.fa.open')}
            <ExternalLink size={15} aria-hidden="true" />
          </Link>
        </Tooltip>
      </SettingsRow>

      <p className="pt-4 text-[13px] leading-snug text-muted-foreground" data-testid="settings-fa-note">
        {t('formation.alarm.pageOnly')}
      </p>
    </div>
  );
}
