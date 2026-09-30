'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

interface SaveSettingsBarProps {
  isDirty: boolean;
  isLoading: boolean;
  hasSettings: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
}

// Kısayol etiketi: Mac'te ⌘↵, diğerlerinde Ctrl+↵ (hydration için ilk render Ctrl)
const noopSubscribe = () => () => {};

function useShortcutLabel() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘↵' : 'Ctrl+↵'),
    () => 'Ctrl+↵',
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-current/30 px-1 font-sans text-[10px] leading-4 opacity-70">
      {children}
    </kbd>
  );
}

export default function SaveSettingsBar({
  isDirty,
  isLoading,
  hasSettings,
  onSave,
  onDiscard,
}: SaveSettingsBarProps) {
  const t = useT();
  const disabled = isLoading || !hasSettings || !isDirty;
  const shortcut = useShortcutLabel();

  // Cmd+Enter (Mac) / Ctrl+Enter (Windows) kaydeder
  useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void onSave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, onSave]);

  return (
    <>
      {/* Başlıktaki sabit buton */}
      <Button
        variant={isDirty ? 'primary' : 'secondary'}
        onClick={onSave}
        disabled={disabled}
        loading={isLoading}
        className="relative"
        hint={
          isLoading
            ? t('saveBar.saving.hint')
            : isDirty
              ? t('saveBar.saveAll.hint')
              : t('saveBar.saved.hint')
        }
      >
        {!isLoading && (isDirty ? <Save size={15} /> : <Check size={15} />)}
        {isLoading ? t('common.saving') : isDirty ? t('saveBar.saveAll') : t('common.saved')}
        {isDirty && !isLoading && <Kbd>{shortcut}</Kbd>}
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
              <Button
                variant="secondary"
                size="sm"
                onClick={onDiscard}
                disabled={isLoading}
                data-testid="unsaved-discard"
                hint={t('saveBar.discard.hint')}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                loading={isLoading}
                disabled={disabled}
                hint={t('saveBar.saveAll.hint')}
              >
                {!isLoading && <Save size={14} />}
                {t('common.save')}
                {!isLoading && <Kbd>{shortcut}</Kbd>}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
