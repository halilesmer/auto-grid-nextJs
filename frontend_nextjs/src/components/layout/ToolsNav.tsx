'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calculator, ChevronDown, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { DropdownMenu, useDropdownClose } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';

const TOOLS = [
  { href: '/tools/grid-risk', labelKey: 'nav.tools.gridRisk', descKey: 'nav.tools.gridRisk.desc', hintKey: 'nav.tools.gridRisk.hint', icon: Calculator },
] as const;

/** Ein Eintrag mit Symbol, Name und Kurzbeschreibung; schließt das umgebende Menü beim Klick. */
function ToolItems() {
  const t = useT();
  const pathname = usePathname();
  const close = useDropdownClose();
  return TOOLS.map(({ href, labelKey, descKey, hintKey, icon: Icon }) => {
    const active = pathname.startsWith(href);
    return (
      <Tooltip key={href} content={t(hintKey)} className="w-full">
        <Link
          href={href}
          onClick={close}
          aria-current={active ? 'page' : undefined}
          data-testid="nav-tool-grid-risk"
          className={cn(
            'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active && 'bg-accent',
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon size={16} /></span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-foreground">{t(labelKey)}</span>
            <span className="text-xs leading-snug text-muted-foreground">{t(descKey)}</span>
          </span>
        </Link>
      </Tooltip>
    );
  });
}

/** „Araçlar“-Menü: ab lg ein Aufklappmenü in der Kopfzeile, unter lg eine Gruppe im ☰-Panel. */
export default function ToolsNav({ layout }: { layout: 'row' | 'panel' }) {
  const t = useT();
  const active = usePathname().startsWith('/tools');
  if (layout === 'panel') {
    return (
      <div data-testid="nav-tools-group" className="mt-1 border-t border-border pt-1.5">
        <div className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('nav.tools')}</div>
        <ToolItems />
      </div>
    );
  }
  return (
    <DropdownMenu
      label={t('nav.tools')}
      hint={t('nav.tools.hint')}
      variant="ghost"
      size="md"
      align="left"
      panelClassName="w-80 p-1.5"
      triggerProps={{ 'data-testid': 'nav-tools', className: cn('gap-2 px-2.5 text-xs xl:px-3', active ? 'text-foreground' : 'text-muted-foreground') }}
      icon={<><Wrench size={15} />{t('nav.tools')}<ChevronDown size={12} /></>}
    >
      <ToolItems />
    </DropdownMenu>
  );
}
