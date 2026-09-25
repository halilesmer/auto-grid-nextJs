'use client';

import { motion } from 'motion/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/store';
import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';

const OPTIONS: { value: ThemePreference; labelKey: MessageKey; hintKey: MessageKey; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'common.theme.light', hintKey: 'common.theme.light.hint', icon: Sun },
  { value: 'dark', labelKey: 'common.theme.dark', hintKey: 'common.theme.dark.hint', icon: Moon },
  { value: 'system', labelKey: 'common.theme.system', hintKey: 'common.theme.system.hint', icon: Monitor },
];

export default function ThemeToggle() {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // Mobilde tek buton: tıklayınca sıradaki temaya geçer (Açık → Koyu → Sistem)
  const currentIndex = Math.max(0, OPTIONS.findIndex((o) => o.value === theme));
  const current = OPTIONS[currentIndex];
  const next = OPTIONS[(currentIndex + 1) % OPTIONS.length];
  const CurrentIcon = current.icon;
  const currentLabel = t(current.labelKey);
  const nextLabel = t(next.labelKey);

  return (
    <>
      <Tooltip
        content={t('common.theme.cycle.hint', { current: currentLabel, next: nextLabel })}
        className="sm:hidden"
      >
        <button
          type="button"
          aria-label={t('common.theme.aria', { current: currentLabel, next: nextLabel })}
          onClick={() => setTheme(next.value)}
          className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-muted/50 text-foreground transition-colors hover:bg-muted"
        >
          <CurrentIcon size={14} />
        </button>
      </Tooltip>

      <div
        role="radiogroup"
        aria-label={t('common.theme')}
        className="hidden items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 sm:flex"
      >
        {OPTIONS.map(({ value, labelKey, hintKey, icon: Icon }) => {
          const active = theme === value;
          const label = t(labelKey);
          return (
            <Tooltip key={value} content={t(hintKey)} role="presentation">
              <button
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                onClick={() => setTheme(value)}
                className={cn(
                  'relative flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="theme-toggle-active"
                    className="absolute inset-0 rounded-md border border-border bg-card shadow-sm"
                    transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
                  />
                )}
                <Icon size={14} className="relative z-10" />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </>
  );
}
