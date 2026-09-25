'use client';

import ChartViewer from '@/components/ChartViewer';
import { useT } from '@/i18n';

export default function FormasyonPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header>
        <p className="mb-2 text-xs text-muted-foreground">{t('formation.eyebrow')}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('formation.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('formation.subtitle')}</p>
      </header>
      <div className="min-h-150">
        <ChartViewer />
      </div>
    </div>
  );
}
