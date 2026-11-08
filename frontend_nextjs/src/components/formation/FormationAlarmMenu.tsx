'use client';

import { useState } from 'react';
import { Bell, BellOff, TrendingDown, TrendingUp, X } from 'lucide-react';
import AnimatedTabs from '@/components/ui/animated-tabs';
import { Button } from '@/components/ui/button';
import { DropdownMenu, useDropdownClose } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import type { useFormationAlarm } from '@/hooks/useFormationAlarm';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { HISTORY_LIMIT, type HistoryEntry } from '@/lib/formation/alarmHistory';
import { SCAN_FORMATIONS } from '@/lib/formation/scan';
import { TrendSettingsPanel } from '@/components/chart-workspace/TrendSettingsPanel';
import { useAnalysisPrefsStore } from '@/store/useAnalysisPrefsStore';
import { cn } from '@/lib/utils';

type Alarm = ReturnType<typeof useFormationAlarm>;

const REST_STATUS = { none: 'formation.alarm.status.rest.none', gone: 'formation.alarm.status.rest.gone', checking: 'formation.alarm.status.checking' } as const satisfies Record<string, MessageKey>;
const RULE_LABEL = { welle: 'formation.alarm.trend.rule.welle', geruest: 'formation.alarm.trend.rule.geruest', filter: 'formation.alarm.trend.rule.filter' } as const satisfies Record<string, MessageKey>;
const REST_NOTE = { none: 'formation.alarm.rest.none.note', gone: 'formation.alarm.rest.gone.note', checking: 'formation.alarm.checking.note' } as const satisfies Record<string, MessageKey>;

/** Nur lesende Zeile mit den Trend-Einstellungen des Charts; [Ayarlar] klappt dasselbe Panel auf wie das Zahnrad im Chart */
function TrendRow() {
  const t = useT();
  const fmt = useFormat();
  const trend = useAnalysisPrefsStore((s) => s.trend);
  const [open, setOpen] = useState(false);
  const rule = trend.rule === 'groesse' ? t('cw.trend.minSize') : t(RULE_LABEL[trend.rule]);
  const size = trend.rule === 'welle' ? '' : ` · ${fmt.number(trend.minSize, { maximumFractionDigits: 2 })} ATR`;
  return (
    <div className="flex flex-col gap-1" data-testid="formation-alarm-trend">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0" data-testid="formation-alarm-trend-text">
          {t('formation.alarm.trend')}: {rule}
          {size} · {t('formation.alarm.trend.closes', { count: trend.changeCloses })}
        </span>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)} hint={t('formation.alarm.trend.settings.hint')} data-testid="formation-alarm-trend-settings">
          {t('formation.alarm.trend.settings')}
        </Button>
      </div>
      {open && (
        <div className="max-h-72 overflow-y-auto rounded-md border border-border" data-testid="formation-alarm-trend-panel">
          <TrendSettingsPanel />
        </div>
      )}
    </div>
  );
}

/** Gruppenkopf über den Einträgen einer Sammelmeldung: erscheint beim ersten Eintrag eines Durchlaufs */
const startsGroup = (list: readonly HistoryEntry[], i: number) => list[i].batch !== 'single' && (i === 0 || list[i - 1].at !== list[i].at || list[i - 1].batch !== list[i].batch);

function HistoryList({ alarm }: { alarm: Alarm }) {
  const t = useT();
  const fmt = useFormat();
  const close = useDropdownClose();
  const { history } = alarm;
  const today = new Date().toDateString();
  const when = (at: number) => (new Date(at).toDateString() === today ? fmt.time(at) : fmt.dateTime(at));
  if (history.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground" data-testid="formation-alarm-history-empty">
        <span className="block font-medium text-foreground">{t('formation.alarm.history.empty')}</span>
        {t('formation.alarm.history.empty.note')}
      </p>
    );
  }
  return (
    <ul aria-label={t('formation.alarm.history.list')} className="-mx-3 flex max-h-80 flex-col overflow-y-auto border-y border-border" data-testid="formation-alarm-history">
      {history.map((entry, i) => {
        const form = t(`formation.form.${entry.form}` as MessageKey);
        const buy = entry.side === 'buy';
        const SideIcon = buy ? TrendingUp : TrendingDown;
        const both = entry.events.length === 2;
        const event = both ? 'both' : entry.events[0];
        return (
          <li key={entry.id} className="border-b border-border last:border-b-0">
            {startsGroup(history, i) && (
              // Die Größe der Gruppe zählt die Einträge, die noch in der Liste stehen
              <div className="flex justify-between gap-2 bg-muted px-3 py-1 text-xs text-muted-foreground tabular-nums" data-testid="formation-alarm-history-group">
                <span className="min-w-0 truncate">{t(entry.batch === 'since' ? 'formation.alarm.history.group.since' : 'formation.alarm.history.group.many', { count: history.filter((x) => x.at === entry.at && x.batch === entry.batch).length })}</span>
                <span className="shrink-0">{when(entry.at)}</span>
              </div>
            )}
            <Tooltip content={t('formation.alarm.history.item.hint', { symbol: entry.symbol, form })} role="presentation" className="w-full min-w-0">
              <button
                type="button"
                data-testid="formation-alarm-history-item"
                data-symbol={entry.symbol}
                onClick={() => {
                  close();
                  alarm.openEntry(entry);
                }}
                className="grid w-full cursor-pointer grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="min-w-0 truncate text-sm font-semibold">
                  {entry.symbol} <span className="font-normal text-muted-foreground">· {form}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{when(entry.at)}</span>
                <span className="col-span-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={cn('inline-flex h-[18px] items-center rounded-[5px] border px-1.5', entry.events.includes('valid') ? 'border-success/40 bg-success/10 text-success' : 'border-warning/40 bg-warning/10 text-warning')}>
                    {t(`formation.alarm.history.event.${event}` as MessageKey)}
                  </span>
                  <span className={cn('inline-flex items-center gap-0.5', buy ? 'text-success' : 'text-danger')}>
                    <SideIcon size={12} aria-hidden="true" />
                    {t(`formation.side.${entry.side}` as MessageKey)}
                  </span>
                  <span className="text-muted-foreground">· {entry.tf}</span>
                </span>
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Glocke in der Kopfleiste neben dem Bild-Knopf: Menü mit Stand des Alarms, den Schaltern „Alle Favoriten“ und „Alarm für
 * <Produkt>“, den weiteren Alarm-Produkten, den Ereignissen, den Formationen und den Kanälen. Das Banner sagt dauerhaft,
 * dass der Alarm auf jeder Seite läuft, solange die App offen ist. Ohne Konto, für das der Alarm sucht, zeigt das Menü nur den Grund der Ruhe.
 */
export function FormationAlarmMenu({ symbol, alarm, pastView = false }: { symbol: string | null; alarm: Alarm; pastView?: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [tab, setTab] = useState<'settings' | 'history'>('history');
  const { prefs, enabled, favoritesEnabled, extras, status, permission, history, account } = alarm;
  // Kein Konto, mit dem der Alarm suchen darf (und die Seite hat keins): das Menü nennt nur den Grund
  const rest = !alarm.pageAccount && account.state !== 'ok' ? account.state : null;
  const on = alarm.active;
  const active = on && rest === null && status.total > 0;
  const incomplete = status.incomplete.length > 0;
  const activeDot = incomplete ? 'bg-warning' : 'bg-success';
  const restDot = rest === 'checking' ? 'bg-muted-foreground' : 'bg-warning';
  const idleDot = active ? activeDot : 'bg-muted-foreground';
  const liveDot = rest !== null ? restDot : idleDot;
  const dot = on ? liveDot : 'bg-muted-foreground';
  const icon = (
    <span className="relative inline-flex">
      {active ? <Bell size={16} /> : <BellOff size={16} />}
      {on && (active || rest !== null) && <span className={cn('absolute -right-1 -top-1 size-2 rounded-full border border-background', dot)} aria-hidden="true" />}
    </span>
  );
  const blocked = permission === 'denied';
  const runningText = t(status.lastRunAt === null ? 'formation.alarm.status.running' : 'formation.alarm.status.active', { time: status.lastRunAt === null ? '' : fmt.time(status.lastRunAt), ready: status.ready, total: status.total });
  const activeText = active ? runningText : t('formation.alarm.status.off');
  const remembered = account.source === 'remembered' ? t('formation.alarm.status.remembered', { account: account.label }) : '';
  const liveText = rest !== null ? t(REST_STATUS[rest]) : remembered + activeText;
  const statusText = on ? liveText : t('formation.alarm.status.paused');
  return (
    <DropdownMenu
      label={t('formation.alarm.menu')}
      hint={pastView ? t('formation.alarm.menu.past.hint') : t('formation.alarm.menu.hint')}
      icon={icon}
      variant="ghost"
      size="icon-sm"
      align="left"
      className="max-lg:mr-1"
      panelClassName="w-80 max-w-[calc(100vw-1rem)]"
      triggerProps={{ 'data-testid': 'formation-alarm', 'data-enabled': String(active), 'data-keep': '', disabled: pastView }}
    >
      <div className="flex flex-col gap-3 p-3" data-testid="formation-alarm-panel">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('formation.alarm.menu')}</span>
            <Switch id="formation-alarm-active" checked={on} onChange={alarm.setActive} label={t(on ? 'formation.alarm.active' : 'formation.alarm.inactive')} hint={t('formation.alarm.active.hint')} />
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums" data-testid="formation-alarm-status">
            <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
            {statusText}
          </span>
          {rest === null && <TrendRow />}
        </div>
        {rest !== null ? (
          <p className={cn('rounded-md border px-2 py-1.5 text-xs text-foreground', rest === 'checking' ? 'border-border bg-muted' : 'border-warning/30 bg-warning/10')} data-testid="formation-alarm-rest-note">
            {t(REST_NOTE[rest])}
          </p>
        ) : (
          <>
          <AnimatedTabs
            variant="segment"
            layoutId="formation-alarm-tabs"
            activeTab={tab}
            onChange={(id) => setTab(id as 'settings' | 'history')}
            tabs={[
              { id: 'settings', label: t('formation.alarm.tab.settings'), hint: t('formation.alarm.tab.settings.hint') },
              { id: 'history', label: history.length > 0 ? `${t('formation.alarm.tab.history')} (${history.length})` : t('formation.alarm.tab.history'), hint: t('formation.alarm.tab.history.hint') },
            ]}
          />
          {tab === 'history' ? (
            <>
              <HistoryList alarm={alarm} />
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{t('formation.alarm.history.limit', { count: HISTORY_LIMIT })}</span>
                <Button variant="ghost" size="sm" disabled={history.length === 0} onClick={alarm.clearHistory} hint={t(history.length === 0 ? 'formation.alarm.history.clear.empty.hint' : 'formation.alarm.history.clear.hint')} data-testid="formation-alarm-history-clear">
                  {t('formation.alarm.history.clear')}
                </Button>
              </div>
            </>
          ) : (
            <div className={cn('flex flex-col gap-3', !on && 'opacity-60')} data-testid="formation-alarm-settings" data-dimmed={String(!on)}>
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
          )}
          </>
        )}
      </div>
    </DropdownMenu>
  );
}
