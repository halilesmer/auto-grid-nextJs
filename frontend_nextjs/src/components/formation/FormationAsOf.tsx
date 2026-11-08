'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { useFormat, useT, type MessageKey } from '@/i18n';
import { formatAt, parseAt, resolveAsOf, stepAsOf } from '@/lib/formation/asOf';
import { dayOf } from '@/lib/serverTime';
import { cn } from '@/lib/utils';

/**
 * Breite des Containers `formation-main` zwischen 91 rem und 106 rem: die Kopfleiste ist dort eine Reihe, und die Reserve für die Werkzeuge (24,25 rem) lässt für
 * den Stand im Vergangenheits-Zustand keinen Platz, ohne in drei Zeilen (94 px) umzubrechen (UI-15, gemessen 2026-11-04 bei 1500 bis 1750 px Fenster).
 * Dort zeigt der Schalter nur das Symbol, und ◀ ▶ ✕ schweben im Chart.
 */
const M15 = 900;
const QUICK = [
  { key: 'day', sec: 86_400 },
  { key: 'week', sec: 7 * 86_400 },
  { key: 'month', sec: 30 * 86_400 },
] as const;
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const pad = (n: number) => String(n).padStart(2, '0');

/** `15.10. 14:30` für das Handy (Jahr steht im Hinweis auf dem Chart) */
function shortAt(sec: number): string {
  const d = new Date(sec * 1000);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}. ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Handy im Hochformat (unter 640 px) oder im Querformat (Höhe bis 30 rem): die Kopfleiste hat keinen Platz, die Schritte schweben im Chart */
const COMPACT_QUERY = '(max-width: 639px), (max-height: 480px)';
export function useCompact(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(COMPACT_QUERY);
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}

interface Props {
  /** Schwebende Ausgabe im Chart (Band 91 bis 106 rem): der Schalter steht dort nicht in der Kopfleiste, das Panel öffnet nach oben */
  float?: boolean;
  /** Zeitpunkt der Suche (MT5-Sekunden) oder null = live */
  pastAt: number | null;
  /** Brokerzeit jetzt in MT5-Sekunden (ohne verlässliche Brokeruhr UTC) */
  now: () => number;
  /** Wert für `?at=` oder null (live) */
  onChange: (value: string | null) => void;
  /** Gesetzt: der Schalter ist aus (z. B. Zeiteinheit ohne Formationssuche) und der Hinweis nennt den Grund */
  disabledHint?: string;
}

/**
 * Schalter „Stand“ der Kopfleiste (FRM-38): live oder ein Zeitpunkt in der Vergangenheit. Der Klick öffnet auf dem Desktop ein Popover,
 * unter 640 px ein Blatt von unten. Datum und Uhrzeit sind Brokerzeit; die Uhrzeit springt im Takt der Suche (15 Minuten).
 */
export function FormationAsOf({ pastAt, now, onChange, float = false, disabledHint }: Props) {
  const t = useT();
  const format = useFormat();
  const compact = useCompact();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'live' | 'past'>('live');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('00:00');
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: string; bottom: string; right: number }>({ top: '0px', bottom: 'auto', right: 8 });
  const titleId = useId();

  const draftFrom = (sec: number) => {
    setDate(dayOf(sec));
    setTime(formatAt(sec).slice(11));
  };
  const toggle = () => {
    if (!open) {
      setMode(pastAt === null ? 'live' : 'past');
      draftFrom(pastAt ?? Math.floor((now() - 86_400) / M15) * M15);
    }
    setOpen(!open);
  };

  // Das Panel steht im body (über Seitenleiste und Werkzeugkarte); auf dem Desktop unter dem Schalter, auf dem Handy im Querformat unter der Kopfzeile der App
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const short = window.innerHeight <= 480;
      const right = Math.max(8, window.innerWidth - rect.right);
      if (float && !short) setPlace({ top: 'auto', bottom: `${window.innerHeight - rect.top + 8}px`, right });
      else setPlace({ top: `${short ? 64 : rect.bottom + 8}px`, bottom: 'auto', right });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, float]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (root.current && !root.current.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Fokus: beim Öffnen auf das Panel, beim Schließen zurück auf den Schalter (nur wenn er im Panel lag)
  useEffect(() => {
    if (!open) return;
    const el = panel.current;
    const trigger = root.current?.querySelector<HTMLButtonElement>('button');
    el?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
    return () => {
      if (el && el.contains(document.activeElement)) trigger?.focus();
    };
  }, [open]);

  const quick = (sec: number) => {
    setMode('past');
    draftFrom(Math.floor((now() - sec) / M15) * M15);
  };
  const apply = () => {
    if (mode === 'live') {
      onChange(null);
    } else {
      const sec = parseAt(`${date}T${time}`);
      if (sec === null) return;
      onChange(formatAt(sec));
    }
    setOpen(false);
  };
  const today = dayOf(now());
  const past = pastAt !== null;

  // Die schwebende Ausgabe gibt es nur außerhalb des Handy-Layouts; dort steht der Schalter in der Kopfleiste
  if (float && compact) return null;
  const id = float ? 'formation-asof-float' : 'formation-asof';

  return (
    <div className={cn('pointer-events-auto relative flex shrink-0 items-center gap-1', !float && '@min-[91rem]/formation-main:@max-[106rem]/formation-main:hidden', float && 'hidden @min-[91rem]/formation-main:@max-[106rem]/formation-main:flex')} ref={root} data-testid={float ? 'formation-asof-root-float' : 'formation-asof-root'}>
      <Button
        size="sm"
        variant="outline"
        className={cn('gap-1.5 px-2 sm:h-7', past && 'border-warning/50 bg-warning/10 text-warning hover:bg-warning/15')}
        hint={disabledHint ?? t('formation.asof.menu.hint')}
        disabled={disabledHint !== undefined}
        aria-label={pastAt === null ? t('formation.asof.live') : t('formation.asof.chip', { time: format.mt5DateTime(pastAt) })}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid={id}
        data-keep=""
        data-state={past ? 'past' : 'live'}
        onClick={toggle}
      >
        {pastAt === null ? (
          <>
            <span className="size-2 rounded-full bg-success shadow-[0_0_0_3px] shadow-success/20" aria-hidden="true" />
            <span className="sr-only @min-[106rem]/formation-main:not-sr-only">{t('formation.asof.live')}</span>
          </>
        ) : (
          <>
            <Clock size={13} aria-hidden="true" />
            <span className="hidden tabular-nums @min-[106rem]/formation-main:inline" data-testid="formation-asof-text">{t('formation.asof.chip', { time: format.mt5DateTime(pastAt) })}</span>
            <span className="sr-only @min-[106rem]/formation-main:hidden" data-testid="formation-asof-text-short">{shortAt(pastAt)}</span>
          </>
        )}
      </Button>
      {past && !compact && !float && (
        <Button size="icon-sm" variant="ghost" className="@max-[106rem]/formation-main:hidden" hint={t('formation.asof.close.hint')} aria-label={t('formation.asof.close')} data-testid="formation-asof-close" onClick={() => { setOpen(false); onChange(null); }}>
          <X size={14} />
        </Button>
      )}
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-overlay sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            ref={panel}
            style={{ '--asof-top': place.top, '--asof-bottom': place.bottom, '--asof-right': `${place.right}px` } as CSSProperties}
            role="dialog"
            aria-modal={compact}
            aria-labelledby={titleId}
            data-testid="formation-asof-panel"
            className="fixed z-[70] flex max-h-[calc(100dvh-4.5rem)] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-popover p-3 shadow-2xl max-sm:inset-x-0 max-sm:bottom-0 max-sm:w-auto max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:right-(--asof-right) sm:top-(--asof-top) sm:bottom-(--asof-bottom)"
          >
            <span className="mx-auto h-1 w-9 rounded-full bg-border sm:hidden" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span id={titleId} className="text-sm font-semibold">{t('formation.asof.title')}</span>
              <span className="text-xs text-muted-foreground">{t('formation.asof.note')}</span>
            </div>
            <div role="group" aria-label={t('formation.asof.mode')} className="flex w-full gap-0.5 self-start rounded-md border border-border p-0.5 sm:w-fit">
              {(['live', 'past'] as const).map((m) => (
                <Button
                  key={m}
                  size="sm"
                  variant={mode === m ? 'secondary' : 'ghost'}
                  className="h-7 flex-1 px-3"
                  hint={t(`formation.asof.mode.${m}.hint` as MessageKey)}
                  aria-pressed={mode === m}
                  data-testid={`formation-asof-mode-${m}`}
                  onClick={() => setMode(m)}
                >
                  {t(`formation.asof.mode.${m}` as MessageKey)}
                </Button>
              ))}
            </div>
            <div className={cn('grid grid-cols-2 gap-2', mode === 'live' && 'opacity-45')}>
              <InputField label={t('formation.asof.date')} hint={t('formation.asof.date.hint')}>
                <input
                  type="date"
                  value={date}
                  min="2000-01-01"
                  max={today}
                  disabled={mode === 'live'}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="formation-asof-date"
                  className="h-8 w-full min-w-0 rounded-md border border-border bg-muted px-2 font-mono text-xs"
                />
              </InputField>
              <InputField label={t('formation.asof.time')} hint={t('formation.asof.time.hint')}>
                <select
                  value={time}
                  disabled={mode === 'live'}
                  onChange={(e) => setTime(e.target.value)}
                  data-testid="formation-asof-time"
                  className="h-8 w-full min-w-0 rounded-md border border-border bg-muted px-2 font-mono text-xs"
                >
                  {TIMES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </InputField>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <Button key={q.key} size="sm" variant="outline" className="h-7 px-2" hint={t(`formation.asof.quick.${q.key}.hint` as MessageKey)} data-testid={`formation-asof-quick-${q.key}`} onClick={() => quick(q.sec)}>
                  {t(`formation.asof.quick.${q.key}` as MessageKey)}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{t('formation.asof.history')}</p>
            <div className="flex gap-2 sm:justify-between">
              <Button size="sm" variant="outline" className="max-sm:flex-1" hint={t('formation.asof.cancel.hint')} data-testid="formation-asof-cancel" onClick={() => setOpen(false)}>
                {t('formation.asof.cancel')}
              </Button>
              <Button size="sm" className="max-sm:flex-1" hint={t('formation.asof.apply.hint')} data-testid="formation-asof-apply" disabled={mode === 'past' && !date} onClick={apply}>
                {t('formation.asof.apply')}
              </Button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

/**
 * Eine Kerze der gewählten Zeiteinheit zurück oder vor. Vor der Gegenwart geht es zurück zu live (kein `at`).
 * Auf dem Handy (Hoch- und Querformat) schwebt es unten rechts im Chart (`float`), damit die Kopfleiste nicht wächst; sonst steht es in der Kopfleiste.
 * Die Seite rendert beide Orte, je einer zeigt sich.
 */
export function FormationAsOfSteps({ pastAt, tfSec, now, onChange, float = false }: Props & { tfSec: number; float?: boolean }) {
  const t = useT();
  const compact = useCompact();
  // Die Leiste zeigt die Schritte, außer auf dem Handy; der schwebende Satz steht auf dem Handy und im Band (Band 91 bis 106 rem), dort per Container-Abfrage
  if (pastAt === null || (!float && compact)) return null;
  const go = (dir: -1 | 1) => {
    const next = stepAsOf(pastAt, tfSec, dir);
    const value = formatAt(next);
    onChange(resolveAsOf(value, now()) === null ? null : value);
  };
  const suffix = float ? '-float' : '';
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center rounded-md border border-warning/50 bg-warning/10',
        float && 'bg-background',
        !float && '@max-[106rem]/formation-main:hidden',
      )}
      role="group"
      data-testid={`formation-asof-steps${suffix}`}
    >
      <Button size="icon-sm" variant="ghost" className="text-warning" hint={t('formation.asof.prev.hint')} aria-label={t('formation.asof.prev')} data-testid={`formation-asof-prev${suffix}`} onClick={() => go(-1)}>
        <ChevronLeft size={15} />
      </Button>
      <Button size="icon-sm" variant="ghost" className="text-warning" hint={t('formation.asof.next.hint')} aria-label={t('formation.asof.next')} data-testid={`formation-asof-next${suffix}`} onClick={() => go(1)}>
        <ChevronRight size={15} />
      </Button>
      {float && (
        <Button size="icon-sm" variant="ghost" className="text-warning" hint={t('formation.asof.close.hint')} aria-label={t('formation.asof.close')} data-testid="formation-asof-close-float" onClick={() => onChange(null)}>
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
