'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
}

export function Modal({ open, onClose, title, icon, children, className, dismissible = true }: ModalProps) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className={cn(
              'relative w-full max-w-md rounded-xl border border-border bg-popover p-6 text-popover-foreground shadow-2xl shadow-black/15 dark:shadow-black/60',
              className,
            )}
          >
            {(title || dismissible) && (
              <div className="mb-4 flex items-center gap-3">
                {icon}
                {title && <h3 className="flex-1 text-base font-semibold tracking-tight">{title}</h3>}
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
