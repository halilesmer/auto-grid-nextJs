'use client';

import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';

/** Üst menüdeki dişli: kapsamlı ayar penceresini açar (plan 1114-A4). */
export default function SettingsButton() {
  const t = useT();
  const show = useSettingsDialogStore((s) => s.show);
  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={t('sdlg.open')}
      hint={t('sdlg.open.hint')}
      data-testid="settings-open"
      onClick={() => show()}
    >
      <Settings size={16} />
    </Button>
  );
}
