'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { useT, type MessageKey } from '@/i18n';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';

/** Robot ve zone ile Kullanıcılar bölümleri ayar taşımaz, yalnız ilgili sayfaya götürür (işlem ayarları hesabın yanında kalır). */
export default function LinkSection({
  href,
  textKey,
  openKey,
  testId,
}: {
  href: string;
  textKey: MessageKey;
  openKey: 'sdlg.robot.open' | 'sdlg.users.open';
  testId: string;
}) {
  const t = useT();
  const hide = useSettingsDialogStore((s) => s.hide);
  return (
    <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5" data-testid={testId}>
      <p className="text-sm leading-relaxed text-muted-foreground">{t(textKey)}</p>
      <Tooltip content={t(`${openKey}.hint`)}>
        <Link
          href={href}
          onClick={hide}
          data-testid={`${testId}-link`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-[13px] font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-10"
        >
          {t(openKey)}
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </Tooltip>
    </div>
  );
}
