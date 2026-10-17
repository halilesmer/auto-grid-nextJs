'use client';

import { motion } from 'motion/react';
import { useLocaleStore } from '@/store';
import { LOCALES, LOCALE_NAMES, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

/** Dil seçimi (TR · EN · DE); üst menüde (HeaderMenu) tam genişlikte durur. */
export default function LanguageSwitcher() {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div
      role="radiogroup"
      aria-label={t('common.language')}
      data-testid="language-switcher"
      className="flex w-full items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
    >
      {LOCALES.map((value) => {
        const active = locale === value;
        return (
          <Tooltip key={value} content={t('nav.language.option.hint', { language: LOCALE_NAMES[value] })} role="presentation" className="flex-1">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={LOCALE_NAMES[value]}
              data-testid={`language-${value}`}
              onClick={() => setLocale(value)}
              className={cn(
                'relative flex h-8 w-full cursor-pointer items-center justify-center rounded-md px-1.5 font-mono text-[11px] font-semibold uppercase transition-colors',
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
          </Tooltip>
        );
      })}
    </div>
  );
}
