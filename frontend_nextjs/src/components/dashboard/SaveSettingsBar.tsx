'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

interface SaveSettingsBarProps {
  isDirty: boolean;
  isLoading: boolean;
  hasSettings: boolean;
  onSave: () => Promise<void>;
}

export default function SaveSettingsBar({
  isDirty,
  isLoading,
  hasSettings,
  onSave,
}: SaveSettingsBarProps) {
  const t = useT();
  const disabled = isLoading || !hasSettings || !isDirty;

  return (
    <>
      {/* Başlıktaki sabit buton */}
      <Button
        variant={isDirty ? 'primary' : 'secondary'}
        onClick={onSave}
        disabled={disabled}
        loading={isLoading}
        className="relative"
      >
        {!isLoading && (isDirty ? <Save size={15} /> : <Check size={15} />)}
        {isLoading ? t('common.saving') : isDirty ? t('saveBar.saveAll') : t('common.saved')}
        {isDirty && !isLoading && (
          <span className="absolute -right-1 -top-1 size-2.5 rounded-full border-2 border-background bg-warning" />
        )}
      </Button>

      {/* Uzun bölge listesinde kaydetmeyi unutmamak için alttaki yüzen çubuk */}
      <AnimatePresence>
        {isDirty && hasSettings && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
            data-testid="unsaved-bar"
            className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4"
          >
            <div className="flex items-center gap-4 rounded-xl border border-border bg-popover/90 py-2 pl-4 pr-2 shadow-2xl shadow-black/15 dark:shadow-black/60 backdrop-blur-xl">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="size-2 rounded-full bg-warning" />
                {t('saveBar.unsaved')}
              </span>
              <Button variant="primary" size="sm" onClick={onSave} loading={isLoading} disabled={disabled}>
                {!isLoading && <Save size={14} />}
                {t('common.save')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
