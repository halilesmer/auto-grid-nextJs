'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { CandlestickChart, Grid3x3, LayoutDashboard, Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VERSION } from '@/app/version';
import ThemeToggle from './ThemeToggle';

const LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/formasyon', label: 'Formasyon', icon: CandlestickChart },
  { href: '/vps', label: 'VPS', icon: Server },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]">
            <Grid3x3 size={16} strokeWidth={2.5} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight text-foreground">Grid Robot</span>
            <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{VERSION}</span>
          </span>
        </Link>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className={cn(
                  'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
            );
          })}
        </div>

        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
