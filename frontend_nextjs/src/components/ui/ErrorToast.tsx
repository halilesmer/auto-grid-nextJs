'use client';

import { AlertCircle, X } from 'lucide-react';

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  return (
    <div
      role="alert"
      className="fixed bottom-6 right-6 z-50 flex max-w-md items-start gap-3 rounded-xl border border-danger/40 bg-popover/95 p-4 text-sm shadow-2xl shadow-black/15 dark:shadow-black/60 backdrop-blur animate-slide-in"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-danger/15 text-danger">
        <AlertCircle size={16} />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <p className="font-semibold text-foreground">Hata</p>
        <p className="mt-0.5 break-words text-muted-foreground">{message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
