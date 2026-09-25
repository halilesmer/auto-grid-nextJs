'use client';

import { motion } from 'motion/react';
import { useLocaleStore } from '@/store';
import { LOCALES, LOCALE_NAMES, useT } from '@/i18n';
import { cn } from '@/lib/utils';

export default function LanguageSwitcher() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  // Mobilde tek buton: tıklayınca sıradaki dile geçer (TR → EN → DE)
  const next = LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length];

  return (
    <>
      <button
        type="button"
        data-testid="language-cycle"
        aria-label={t('nav.language.aria', { current: LOCALE_NAMES[locale], next: LOCALE_NAMES[next] })}
        title={LOCALE_NAMES[locale]}
        onClick={() => setLocale(next)}
        className="flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-muted/50 px-1.5 font-mono text-[11px] font-semibold uppercase text-foreground transition-colors hover:bg-muted sm:hidden"
      >
        {locale}
      </button>

      <div
        role="radiogroup"
        aria-label={t('common.language')}
        data-testid="language-switcher"
        className="hidden items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 sm:flex"
      >
        {LOCALES.map((value) => {
          const active = locale === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={LOCALE_NAMES[value]}
              title={LOCALE_NAMES[value]}
              data-testid={`language-${value}`}
              onClick={() => setLocale(value)}
              className={cn(
                'relative flex h-7 min-w-8 cursor-pointer items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold uppercase transition-colors',
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {active && (
                <motion.span
                  layoutId="language-switcher-active"
                  className="absolute inset-0 rounded-md border border-border bg-card shadow-sm"
                  transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
                />
              )}
              <span className="relative z-10">{value}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
