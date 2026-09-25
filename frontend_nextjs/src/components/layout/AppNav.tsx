'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { CandlestickChart, Grid3x3, LayoutDashboard, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { VERSION } from '@/app/version';
import { useT, type MessageKey } from '@/i18n';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

const LINKS: { href: string; labelKey: MessageKey; hintKey: MessageKey; icon: typeof Server }[] = [
  { href: '/', labelKey: 'nav.dashboard', hintKey: 'nav.dashboard.hint', icon: LayoutDashboard },
  { href: '/formasyon', labelKey: 'nav.formation', hintKey: 'nav.formation.hint', icon: CandlestickChart },
  { href: '/vps', labelKey: 'nav.vps', hintKey: 'nav.vps.hint', icon: Server },
];

export default function AppNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 md:px-8">
        <Tooltip content={t('nav.home.hint', { version: VERSION })}>
          <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]">
              <Grid3x3 size={16} strokeWidth={2.5} />
            </span>
            <span className="flex flex-col leading-none">
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">Grid Robot</span>
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{VERSION}</span>
            </span>
          </Link>
        </Tooltip>

        <div className="h-6 w-px shrink-0 bg-border" />

        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          {LINKS.map(({ href, labelKey, hintKey, icon: Icon }) => {
            const label = t(labelKey);
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Tooltip key={href} content={t(hintKey)}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  className={cn(
                    'relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm sm:px-3 font-medium transition-colors',
                    active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="app-nav-active"
                      className="absolute inset-0 rounded-md border border-border bg-accent/70"
                      transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
                    />
                  )}
                  <Icon size={15} className="relative z-10" />
                  <span className="relative z-10 hidden sm:inline">{label}</span>
                </Link>
              </Tooltip>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
