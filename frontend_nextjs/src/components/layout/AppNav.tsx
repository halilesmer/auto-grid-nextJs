'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { CandlestickChart, ChartLine, Grid3x3, LayoutDashboard, Server, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { VERSION } from '@/app/version';
import { useT, type MessageKey } from '@/i18n';
import ConnectionChip from '@/components/connection/ConnectionChip';
import { useAuthStore, type Me } from '@/store/useAuthStore';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';

const LINKS: {
  href: string;
  labelKey: MessageKey;
  hintKey: MessageKey;
  icon: typeof Server;
  /** Sichtbarkeit je Rolle; fehlt = für alle. `me` ist null, solange die Rolle nicht geladen ist. */
  visible?: (me: Me | null) => boolean;
}[] = [
  { href: '/', labelKey: 'nav.dashboard', hintKey: 'nav.dashboard.hint', icon: LayoutDashboard },
  { href: '/chart', labelKey: 'nav.analysis', hintKey: 'nav.analysis.hint', icon: ChartLine },
  { href: '/formasyon', labelKey: 'nav.formation', hintKey: 'nav.formation.hint', icon: CandlestickChart },
  // /vps läuft auch ohne Worker-Verbindung: erst ausblenden, wenn feststeht, dass es kein Admin ist
  { href: '/vps', labelKey: 'nav.vps', hintKey: 'nav.vps.hint', icon: Server, visible: (me) => !me || me.role === 'admin' },
  { href: '/users', labelKey: 'nav.users', hintKey: 'nav.users.hint', icon: Users, visible: (me) => me?.role === 'admin' },
];

export default function AppNav() {
  const pathname = usePathname();
  const t = useT();
  const me = useAuthStore((s) => s.me);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-4 sm:gap-6 md:px-8">
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

        {/* Handy: ohne Trennstrich, damit alle Menü-Symbole (bis zu 5) in die Zeile passen */}
        <div className="hidden h-6 w-px shrink-0 bg-border sm:block" />

        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          {LINKS.filter((link) => !link.visible || link.visible(me)).map(({ href, labelKey, hintKey, icon: Icon }) => {
            const label = t(labelKey);
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Tooltip key={href} content={t(hintKey)}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  className={cn(
                    'relative flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm sm:px-3 font-medium transition-colors',
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ConnectionChip variant="inline" />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
      {/* Handy: kein Platz in der Kopfzeile, der Status steht in einer schmalen Zeile darunter */}
      <ConnectionChip variant="bar" />
    </nav>
  );
}
