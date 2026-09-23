'use client';

import { motion } from 'motion/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemeStore } from '@/store';
import type { ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
];

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
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
        );
      })}
    </div>
  );
}
