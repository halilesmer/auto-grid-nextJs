'use client';

import { useState, type ReactNode } from 'react';
import { Check, Lock, Monitor, X } from 'lucide-react';
import { claimEscape } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useConnectionStore, type ConnectionStatus } from '@/store/useConnectionStore';
import { useUserPrefsStore, type PrefKey } from '@/store/useUserPrefsStore';

export type PrefsLock = 'loading' | 'failed' | 'offline' | 'readonly';

/** Dil ve tema bu cihazda da çalışır (bugünkü isLocalOnly davranışı, 1115-A7.2). */
const DEVICE_LOCAL: PrefKey[] = ['locale', 'theme'];

/** Bağlantı hatası (ulaşılamıyor, anahtar geçersiz, güvensiz adres): kişisel alanlar salt okunur (1115-A7.1). */
export const FAULTY_STATUSES: ConnectionStatus[] = ['unreachable', 'unauthorized', 'insecure'];

/**
 * USR-13 + 1115-A7: kişisel alanlar, kayıtlı değerler okunana kadar ve bağlantı yokken kilitlidir
 * (yoksa varsayılan kayıtlının üstüne yazılırdı). `local`: bağlı olmasa da bu cihazda çalışan ayar.
 */
export function usePrefsLock(prefKey?: PrefKey): { lock: PrefsLock | null; local: boolean } {
  const loadState = useUserPrefsStore((s) => s.loadState);
  const hydrated = useConnectionStore((s) => s.hydrated);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const status = useConnectionStore((s) => s.status);
  if (!hydrated) return { lock: 'loading', local: false };
  if (!baseUrl) {
    const local = !!prefKey && DEVICE_LOCAL.includes(prefKey);
    return { lock: local ? null : 'offline', local };
  }
  if (FAULTY_STATUSES.includes(status)) return { lock: 'readonly', local: false };
  if (loadState === 'offline') return { lock: 'offline', local: false };
  if (loadState === 'ready') return { lock: null, local: false };
  return { lock: loadState === 'failed' ? 'failed' : 'loading', local: false };
}

/** Satırda etiketin yanındaki yükleme durumu: Yükleniyor… / Yüklenemedi + „Tekrar dene“ / Bağlanınca açılır / Salt okunur. */
function PrefLoadBadge({ prefKey, lock }: { prefKey: PrefKey; lock: PrefsLock }) {
  const t = useT();
  const load = useUserPrefsStore((s) => s.load);
  const keys = { offline: 'sdlg.locked.connect', readonly: 'sdlg.ro', loading: 'sdlg.load.loading', failed: 'sdlg.load.failed' } as const;
  const text = t(keys[lock]);
  const hint = t(`${keys[lock]}.hint`);
  return (
    <>
      <Tooltip content={hint}>
        <span
          role="status"
          tabIndex={0}
          data-testid={`pref-load-${prefKey}`}
          data-state={lock}
          className={cn(
            'inline-flex items-center gap-1 rounded text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            lock === 'failed' ? 'font-medium text-danger' : 'text-muted-foreground',
          )}
        >
          {(lock === 'readonly' || lock === 'offline') && <Lock size={12} strokeWidth={2.5} aria-hidden="true" />}
          {text}
        </span>
      </Tooltip>
      {lock === 'failed' && (
        <Tooltip content={t('sdlg.load.retry.hint')}>
          <button
            type="button"
            data-testid={`pref-load-retry-${prefKey}`}
            onClick={() => void load()}
            className="min-h-6 cursor-pointer rounded text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('sdlg.load.retry')}
          </button>
        </Tooltip>
      )}
    </>
  );
}

/** Satırda etiketin yanındaki durum: Kaydediliyor… → ✓ Kaydedildi (birkaç sn sonra kaybolur) ya da ✕ Kaydedilemedi. */
export function PrefStatusBadge({ prefKey }: { prefKey: PrefKey }) {
  const t = useT();
  const status = useUserPrefsStore((s) => s.status[prefKey]);
  if (!status) return null;
  return (
    <span
      role="status"
      data-testid={`pref-status-${prefKey}`}
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        status === 'saving' && 'text-muted-foreground',
        status === 'saved' && 'font-medium text-success',
        status === 'failed' && 'font-medium text-danger',
      )}
    >
      {status === 'saved' && <Check size={13} strokeWidth={2.5} aria-hidden="true" />}
      {status === 'failed' && <X size={13} strokeWidth={2.5} aria-hidden="true" />}
      {t(`sdlg.st.${status}`)}
    </span>
  );
}

interface RowProps {
  label: ReactNode;
  desc?: ReactNode;
  prefKey?: PrefKey;
  isNew?: boolean;
  children: ReactNode;
  testId?: string;
}

/** Bir ayar satırı: solda etiket ve açıklama, sağda kontrol (dar ekranda alt alta). */
export function SettingsRow({ label, desc, prefKey, isNew, children, testId }: RowProps) {
  const t = useT();
  const { lock, local } = usePrefsLock(prefKey);
  const locked = prefKey && lock ? lock : null;
  return (
    <div
      data-testid={testId}
      className="grid min-w-0 gap-3 border-b border-border/60 py-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex min-h-[22px] flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-semibold">{label}</span>
          {isNew && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">{t('sdlg.new')}</span>}
          {locked && prefKey ? <PrefLoadBadge prefKey={prefKey} lock={locked} /> : prefKey && <PrefStatusBadge prefKey={prefKey} />}
          {local && prefKey && (
            <Tooltip content={t('sdlg.local.hint')}>
              <span tabIndex={0} data-testid={`pref-local-${prefKey}`} className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Monitor size={12} strokeWidth={2.5} aria-hidden="true" />
                {t('sdlg.local')}
              </span>
            </Tooltip>
          )}
        </span>
        {desc && <span className="text-[13px] leading-snug text-muted-foreground">{desc}</span>}
      </div>
      {/* fieldset disabled: içindeki tüm düğme ve alanlar kilitlenir */}
      <fieldset disabled={locked !== null} className={cn('m-0 min-w-0 border-0 p-0', locked && 'opacity-50')}>
        {children}
      </fieldset>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

/** Seçenek grubu (aria-pressed düğmeleri); her düğme kendi ipucunu taşır. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  testId,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  testId: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid={testId}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-border bg-muted/50 p-1"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Tooltip key={o.value} content={o.hint}>
            <button
              type="button"
              aria-pressed={on}
              data-testid={`${testId}-${o.value}`}
              onClick={() => {
                if (!on) onChange(o.value);
              }}
              className={cn(
                'min-h-11 cursor-pointer whitespace-nowrap rounded-md px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-9',
                on ? 'bg-primary/15 font-semibold text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

interface SecondsFieldProps {
  ms: number;
  disabled: boolean;
  parse: (text: string) => number | null;
  onCommit: (ms: number) => void;
  ariaLabel: string;
  hint: string;
  help: string;
  error: string;
  testId: string;
}

/** Saniye alanı: Enter ya da alandan çıkış kaydeder; virgül ve nokta kabul edilir; geçersizse eski değere döner. */
export function SecondsField(props: SecondsFieldProps) {
  const f = useFormat();
  const shown = props.disabled ? f.number(0) : f.number(props.ms / 1000, { maximumFractionDigits: 2 });
  return <SecondsInput {...props} shown={shown} />;
}

function SecondsInput({
  shown,
  ms,
  disabled,
  parse,
  onCommit,
  ariaLabel,
  hint,
  help,
  error,
  testId,
}: SecondsFieldProps & { shown: string }) {
  const t = useT();
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  // Gösterilen değer (kayıt, mod değişimi, dil) değişince taslak yeniden başlar. Alan yeniden kurulmaz (key yok): kayıttan sonra odak kalır
  const [seen, setSeen] = useState(shown);
  if (seen !== shown) {
    setSeen(shown);
    setDraft(shown);
    setInvalid(false);
  }

  const commit = () => {
    if (disabled) return;
    // Metin değişmediyse kayıt yok: ekranda yuvarlanan değer (0,333 → „0,33“) yeniden yazılmaz
    if (draft === shown) return;
    const parsed = parse(draft);
    if (parsed === null) {
      setInvalid(true);
      setDraft(shown);
      return;
    }
    setInvalid(false);
    if (parsed !== ms) onCommit(parsed);
    else setDraft(shown);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <Tooltip content={hint}>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            data-testid={testId}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape' && (draft !== shown || invalid)) {
                // İlk Escape yalnız düzenlemeyi geri alır; pencereyi ikincisi kapatır
                claimEscape(e);
                setDraft(shown);
                setInvalid(false);
              }
            }}
            className={cn(
              'h-11 w-24 rounded-lg border bg-background px-3 text-right text-sm tabular-nums text-foreground md:h-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
              invalid ? 'border-danger' : 'border-border',
            )}
          />
        </Tooltip>
        <span>{t('sdlg.unit.sec')}</span>
      </label>
      <span className={cn('text-xs', invalid ? 'text-danger' : 'text-muted-foreground')} data-testid={`${testId}-help`}>
        {invalid ? error : help}
      </span>
    </div>
  );
}

/** Çoklu seçim çipi (aria-pressed): açık = dolu çizgi, kapalı = kesik çizgi (tasarım). */
export function ChipToggle({ pressed, label, hint, onClick, testId }: { pressed: boolean; label: string; hint: string; onClick: () => void; testId: string }) {
  return (
    <Tooltip content={hint}>
      <button
        type="button"
        aria-pressed={pressed}
        data-testid={testId}
        onClick={onClick}
        className={cn(
          'min-h-11 cursor-pointer rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[34px]',
          pressed ? 'border-primary bg-primary/15 font-semibold text-primary' : 'border-dashed border-border text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </button>
    </Tooltip>
  );
}
