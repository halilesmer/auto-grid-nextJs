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

/** Tema seçimi (Açık · Koyu · Sistem); üst menüde (HeaderMenu) simge ve adıyla tam genişlikte durur. */
export default function ThemeToggle() {
  const t = useT();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label={t('common.theme')}
      className="flex w-full items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
    >
      {OPTIONS.map(({ value, labelKey, hintKey, icon: Icon }) => {
        const active = theme === value;
        const label = t(labelKey);
        return (
          <Tooltip key={value} content={t(hintKey)} role="presentation" className="min-w-0 flex-1">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              onClick={() => setTheme(value)}
              className={cn(
                'relative flex h-8 w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-md px-1.5 text-xs transition-colors',
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
              <Icon size={14} className="relative z-10 shrink-0" />
              <span className="relative z-10 truncate">{label}</span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
