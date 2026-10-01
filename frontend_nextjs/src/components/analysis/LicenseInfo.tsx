'use client';

import { ExternalLink, Info } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';

// Wortlaut der NOTICE-Datei von lightweight-charts (Apache 2.0 verlangt Hinweis + Link zu TradingView)
const TRADINGVIEW_NOTICE = 'TradingView Lightweight Charts™\nCopyright (с) 2025 TradingView, Inc. https://www.tradingview.com/';

/** Lizenzhinweis der Chart-Bibliothek (Info-Symbol im Kopf der Analyse-Seite). */
export function LicenseInfo() {
  const t = useT();
  return (
    <DropdownMenu
      label={t('analysis.license')}
      hint={t('analysis.license.hint')}
      icon={<Info size={15} />}
      size="icon-sm"
      variant="ghost"
      panelClassName="w-80"
    >
      <div className="space-y-2 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="license-info">
        <p className="font-semibold text-foreground">{t('analysis.license')}</p>
        <p>{t('analysis.license.text')}</p>
        <p className="whitespace-pre-line rounded-md border border-border bg-muted/50 p-2 font-mono text-[11px] text-foreground">
          {TRADINGVIEW_NOTICE}
        </p>
        <Tooltip content={t('analysis.license.link.hint')}>
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            tradingview.com
            <ExternalLink size={12} />
          </a>
        </Tooltip>
      </div>
    </DropdownMenu>
  );
}
