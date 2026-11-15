'use client';

import { useState, type KeyboardEvent } from 'react';
import { Bell, ChartCandlestick, ChevronLeft, ChevronRight, ExternalLink, Palette, Bot, Link2, Server, Users, X, type LucideIcon } from 'lucide-react';
import { VERSION } from '@/app/version';
import SystemModals from '@/components/layout/SystemModals';
import { Modal } from '@/components/ui/modal';
import { StatusDot } from '@/components/ui/status-dot';
import { Tooltip } from '@/components/ui/tooltip';
import { useSystemActions } from '@/hooks/useSystemActions';
import { LOCALE_NAMES, useLocale, useT, type MessageKey } from '@/i18n';
import { activeMinutes } from '@/lib/newsAlerts';
import { effectiveDelayMs } from '@/lib/userPrefs';
import { cn } from '@/lib/utils';
import { useAuthStore, useIsAdmin } from '@/store/useAuthStore';
import { useChartPrefsStore } from '@/store/useChartPrefsStore';
import { useConnectionStore } from '@/store/useConnectionStore';
import { useCustomColorsStore } from '@/store/useCustomColorsStore';
import { useNewsCurrencies } from '@/hooks/useNewsCurrencies';
import { useNewsStore } from '@/store/useNewsStore';
import { useSettingsDialogStore, type SettingsSection } from '@/store/useSettingsDialogStore';
import { useThemeStore } from '@/store/useThemeStore';
import { useTooltipPrefsStore } from '@/store/useTooltipPrefsStore';
import { useUserPrefsStore } from '@/store/useUserPrefsStore';
import AppearanceSection from './AppearanceSection';
import ChartSection from './ChartSection';
import ConnectionSection from './ConnectionSection';
import NotificationsSection, { NOTIFICATION_TABS, type NotificationsTab } from './NotificationsSection';
import LinkSection from './LinkSection';
import SystemSection, { SYSTEM_TABS, type SystemTab } from './SystemSection';

type SectionTab = NotificationsTab | SystemTab;
/** Sekmeli bölümler ve sekme sırası; sekme etiketi `sdlg.tab.<kimlik>`, ipucu `.hint`. */
const SECTION_TABS: Partial<Record<SettingsSection, readonly SectionTab[]>> = {
  notifications: NOTIFICATION_TABS,
  system: SYSTEM_TABS,
};

interface SectionDef {
  id: SettingsSection;
  icon: LucideIcon;
  /** Sağ üstteki rozet: saklama yerini söyler. */
  badge: 'user' | 'device' | 'account' | 'admin';
  /** Sayfaya götüren bölümler (listede ↗ simgesi). */
  link?: boolean;
}
interface GroupDef {
  id: 'personal' | 'device' | 'account' | 'admin';
  admin?: boolean;
  sections: SectionDef[];
}

const GROUPS: GroupDef[] = [
  {
    id: 'personal',
    sections: [
      { id: 'appearance', icon: Palette, badge: 'user' },
      { id: 'notifications', icon: Bell, badge: 'user' },
      { id: 'chart', icon: ChartCandlestick, badge: 'user' },
    ],
  },
  { id: 'device', sections: [{ id: 'connection', icon: Link2, badge: 'device' }] },
  { id: 'account', sections: [{ id: 'robot', icon: Bot, badge: 'account', link: true }] },
  {
    id: 'admin',
    admin: true,
    sections: [
      { id: 'users', icon: Users, badge: 'admin', link: true },
      { id: 'system', icon: Server, badge: 'admin' },
    ],
  },
];

const BADGE_TONE: Record<SectionDef['badge'], string> = {
  user: 'border-secondary/60 text-secondary',
  device: 'border-border text-muted-foreground',
  account: 'border-border text-muted-foreground',
  admin: 'border-warning/50 text-warning',
};

function useSummary(): Record<SettingsSection, string | null> {
  const t = useT();
  const locale = useLocale();
  const theme = useThemeStore((s) => s.theme);
  const delay = useTooltipPrefsStore((s) => s.delay);
  const status = useConnectionStore((s) => s.status);
  const alerts = useNewsStore((s) => s.alerts);
  const { currencies } = useNewsCurrencies();
  const chartTf = useChartPrefsStore((s) => s.tf);
  const colorCount = useCustomColorsStore((s) => s.colors.length);
  const delayMs = effectiveDelayMs(delay);
  return {
    appearance: t('sdlg.sum.appearance', {
      lang: LOCALE_NAMES[locale],
      theme: t(`common.theme.${theme}`),
      delay: delayMs === 0 ? t('sdlg.sum.delay.instant') : t('sdlg.sum.delay.ms', { ms: delayMs }),
    }),
    notifications: t('sdlg.sum.notifications', { n: activeMinutes(alerts).length, list: currencies.join(', ') || '–' }),
    chart: t('sdlg.sum.chart', { tf: chartTf, n: colorCount }),
    connection: t(`connection.status.${status}`),
    robot: t('sdlg.robot.summary'),
    users: null,
    system: VERSION,
  };
}

function footState(values: (string | undefined)[]): 'failed' | 'saving' | 'ok' {
  if (values.includes('failed')) return 'failed';
  return values.includes('saving') ? 'saving' : 'ok';
}

const FOOT_TONE = { failed: 'danger', saving: 'neutral', ok: 'success' } as const;

function CloseButton({ className }: { className?: string }) {
  const t = useT();
  const hide = useSettingsDialogStore((s) => s.hide);
  return (
    <Tooltip content={t('ui.close.hint')} className={className}>
      <button
        type="button"
        onClick={hide}
        aria-label={t('sdlg.close')}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9"
      >
        <X className="size-5 md:size-4" />
      </button>
    </Tooltip>
  );
}

/**
 * Kapsamlı ayar penceresi (plan 1114-A4, S1). Solda gruplu menü, sağda bölüm; telefonda tam ekran: önce bölüm listesi
 * (altında mevcut değerin özeti), dokununca bölüm, "‹ Ayarlar" geri götürür. Kişisel ayarlar anında kaydedilir (USR-09).
 */
export default function SettingsDialog() {
  const t = useT();
  const open = useSettingsDialogStore((s) => s.open);
  const section = useSettingsDialogStore((s) => s.section);
  const hide = useSettingsDialogStore((s) => s.hide);
  const setSection = useSettingsDialogStore((s) => s.setSection);
  const isAdmin = useIsAdmin();
  const summary = useSummary();
  const system = useSystemActions();
  const prefStatus = useUserPrefsStore((s) => s.status);
  const [tabState, setTab] = useState<{ section: string; tab: SectionTab }>({ section: '', tab: 'general' });

  // Kimlik bilinmiyorsa (worker kapalı ya da bağlı değil) yalnız „VPS ve sistem“ açılabilir: ölü worker'ı SSH ile
  // ayağa kaldırmak için eski /vps sayfası gibi. Gerçek yetkiyi worker (403) ve yerel SSH rotası denetler.
  const identityUnknown = useAuthStore((st) => st.me === null);
  const systemOnly = !isAdmin && identityUnknown && section === 'system';
  const groups = GROUPS.flatMap((g) => {
    if (!g.admin || isAdmin) return [g];
    return systemOnly ? [{ ...g, sections: g.sections.filter((x) => x.id === 'system') }] : [];
  });
  const all = groups.flatMap((g) => g.sections);
  // Masaüstünde ilk bölüm açık gelir; yetkisiz bölüm (admin değil) asla gösterilmez
  const active = all.find((s) => s.id === section) ?? all[0];

  // Sekme bölüm değişince başa döner
  const sectionTabs = SECTION_TABS[active.id] ?? [];
  const tab: SectionTab = tabState.section === active.id ? tabState.tab : (sectionTabs[0] ?? 'general');
  const foot = footState(Object.values(prefStatus));

  // Sekmeler (WAI-ARIA): ← → döner, Home/End uçlara gider; odak ve seçim birlikte taşınır
  const tabId = (id: SectionTab) => `settings-tab-${id}`;
  // Sistem bölümünde tek panel var (yalnız seçili sekme görünür); sekmeler hep aynı panele işaret eder
  const panelId = (id: SectionTab) => ((SYSTEM_TABS as readonly string[]).includes(id) ? 'settings-tabpanel-system' : `settings-tabpanel-${id}`);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return; // tarayıcı kısayollarını yutma
    const last = sectionTabs.length - 1;
    const n = sectionTabs.length;
    const targets: Record<string, number> = { ArrowRight: (index + 1) % n, ArrowLeft: (index - 1 + n) % n, Home: 0, End: last };
    const next = targets[e.key] ?? -1;
    if (next < 0) return;
    e.preventDefault();
    setTab({ section: active.id, tab: sectionTabs[next] });
    document.getElementById(tabId(sectionTabs[next]))?.focus();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={hide}
        chrome={false}
        mobileFull
        label={t('sdlg.title')}
        className="flex h-[min(780px,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0"
      >
        <div className="flex min-h-0 w-full flex-col bg-background md:flex-row" data-testid="settings-dialog">
          <aside
            className={cn(
              'flex min-h-0 shrink-0 flex-col overflow-y-auto bg-card md:w-72 md:border-r md:border-border',
              section ? 'max-md:hidden' : 'max-md:flex-1',
            )}
          >
            <div className="flex items-center justify-between border-b border-border py-3 pl-5 pr-3 md:border-0 md:px-4 md:pb-2 md:pt-6">
              <h2 className="text-[22px] font-bold md:text-xl">{t('sdlg.title')}</h2>
              <CloseButton className="md:hidden" />
            </div>
            <nav aria-label={t('sdlg.nav.aria')} className="flex flex-col gap-1 px-4 pb-6 pt-2" data-testid="settings-nav">
              {groups.map((g) => (
                <div key={g.id} className="flex flex-col gap-1" data-testid={`settings-group-${g.id}`}>
                  <div className="mx-1 mb-1 mt-4 flex items-center justify-between gap-2">
                    <span className={cn('text-[11px] font-semibold tracking-wider', g.admin ? 'text-warning' : 'text-muted-foreground')}>
                      {t(`sdlg.group.${g.id}`)}
                    </span>
                    {g.id === 'personal' && (
                      <span className="text-[11px] text-secondary md:hidden">{t('sdlg.group.personal.owner')}</span>
                    )}
                  </div>
                  <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card max-md:divide-y max-md:divide-border/60 md:gap-0.5 md:border-0 md:bg-transparent">
                    {g.sections.map((s) => {
                      const Icon = s.icon;
                      const current = s.id === active.id;
                      const sum = summary[s.id];
                      return (
                        <Tooltip key={s.id} content={t(`sdlg.sec.${s.id}.hint`)} className="w-full">
                          <button
                            type="button"
                            aria-current={current ? 'page' : undefined}
                            data-testid={`settings-nav-${s.id}`}
                            onClick={() => setSection(s.id)}
                            className={cn(
                              'flex min-h-14 w-full cursor-pointer items-center gap-3.5 px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10 md:rounded-lg md:px-3',
                              current ? 'md:bg-primary/15 md:font-semibold md:text-primary' : 'text-foreground md:hover:bg-accent',
                            )}
                          >
                            <Icon size={18} className="shrink-0 text-muted-foreground md:text-current" aria-hidden="true" />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate">{t(`sdlg.sec.${s.id}` as MessageKey)}</span>
                              {sum && (
                                <span className="truncate text-[13px] font-normal text-muted-foreground md:hidden" data-testid={`settings-sum-${s.id}`}>
                                  {sum}
                                </span>
                              )}
                            </span>
                            {s.link ? (
                              <ExternalLink size={16} className="shrink-0 text-muted-foreground md:hidden" aria-hidden="true" />
                            ) : (
                              <ChevronRight size={18} className="shrink-0 text-muted-foreground md:hidden" aria-hidden="true" />
                            )}
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

          <div className={cn('relative flex min-h-0 min-w-0 flex-1 flex-col', !section && 'max-md:hidden')} data-testid="settings-pane" data-section={active.id}>
            <div className="shrink-0 border-b border-border px-5 pb-4 md:px-10 md:pb-5 md:pt-7">
              <div className="flex items-center justify-between py-2 md:hidden">
                <Tooltip content={t('sdlg.back.hint')}>
                  <button
                    type="button"
                    onClick={() => setSection(null)}
                    data-testid="settings-back"
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1 pr-2 text-[15px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronLeft size={20} aria-hidden="true" />
                    {t('sdlg.back')}
                  </button>
                </Tooltip>
                <CloseButton />
              </div>
              <CloseButton className="absolute right-5 top-5 max-md:hidden" />
              <h3 className="text-2xl font-bold md:text-[22px] md:font-semibold" data-testid="settings-title">{t(`sdlg.sec.${active.id}` as MessageKey)}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t(`sdlg.desc.${active.id}` as MessageKey)}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={cn('rounded-full border px-2.5 py-0.5 text-xs', BADGE_TONE[active.badge])} data-testid="settings-badge">
                  {t(`sdlg.badge.${active.badge}`)}
                </span>
              </div>
              {sectionTabs.length > 0 && (
                <div role="tablist" aria-label={t(active.id === 'system' ? 'sdlg.sys.tabs.aria' : 'sdlg.tabs.aria')} className="-mb-4 mt-4 flex gap-6 overflow-x-auto md:-mb-5" data-testid="settings-tabs">
                  {sectionTabs.map((id, index) => (
                    <Tooltip key={id} content={t(`sdlg.tab.${id}.hint` as MessageKey)}>
                      <button
                        type="button"
                        role="tab"
                        id={tabId(id)}
                        aria-selected={tab === id}
                        aria-controls={panelId(id)}
                        tabIndex={tab === id ? 0 : -1}
                        data-testid={`settings-tab-${id}`}
                        onClick={() => setTab({ section: active.id, tab: id })}
                        onKeyDown={(e) => onTabKey(e, index)}
                        className={cn(
                          '-mb-px min-h-11 shrink-0 cursor-pointer whitespace-nowrap border-b-2 pb-3 pt-2 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          tab === id ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t(`sdlg.tab.${id}` as MessageKey)}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 md:px-10" data-testid="settings-body">
              {active.id === 'appearance' && <AppearanceSection />}
              {active.id === 'notifications' &&
                NOTIFICATION_TABS.map((id) => (
                  <div key={id} role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id)} hidden={tab !== id}>
                    {tab === id && <NotificationsSection tab={id} />}
                  </div>
                ))}
              {active.id === 'chart' && <ChartSection />}
              {active.id === 'connection' && <ConnectionSection />}
              {active.id === 'robot' && <LinkSection href="/" textKey="sdlg.robot.text" openKey="sdlg.robot.open" testId="settings-robot" />}
              {active.id === 'users' && isAdmin && <LinkSection href="/users" textKey="sdlg.users.text" openKey="sdlg.users.open" testId="settings-users" />}
              {active.id === 'system' && (isAdmin || systemOnly) && (
                <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
                  <SystemSection tab={tab as SystemTab} system={system} />
                </div>
              )}
            </div>

            <div
              className="flex shrink-0 items-center gap-2.5 border-t border-border px-5 py-3.5 text-[13px] text-muted-foreground md:px-10 md:py-4"
              role="status"
              data-testid="settings-foot"
              data-state={foot}
            >
              <StatusDot tone={FOOT_TONE[foot]} pulse={foot === 'saving'} />
              <span>{t(`sdlg.foot.${foot}`)}</span>
            </div>
          </div>
        </div>
      </Modal>
      <SystemModals system={system} />
    </>
  );
}
