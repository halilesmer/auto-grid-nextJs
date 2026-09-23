'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AccountFormDialogProps } from '../types';

export function AccountFormDialog({
  open,
  onClose,
  title,
  children,
}: AccountFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open) {
      dialog?.showModal();
    } else {
      dialog?.close();
    }
    return () => {
      dialog?.close();
    };
  }, [open]);

  const handleClose = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl shadow-black/15 dark:shadow-black/60 backdrop:bg-black/40 dark:backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      onClose={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </dialog>
  );
}
