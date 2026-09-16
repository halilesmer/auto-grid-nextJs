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
      className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-0 backdrop:bg-black/60 w-full max-w-2xl text-white"
      onClose={handleClose}
      onKeyDown={handleKeyDown}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}