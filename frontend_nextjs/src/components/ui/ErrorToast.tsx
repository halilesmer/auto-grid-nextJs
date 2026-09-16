'use client';

import { AlertCircle, X } from 'lucide-react';

interface ErrorToastProps {
  message: string;
  onDismiss: () => void;
}

export default function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300 flex items-center gap-3 shadow-2xl animate-slide-in">
      <AlertCircle size={20} />
      <span>{message}</span>
      <button
        onClick={onDismiss}
        className="ml-4 text-red-400 hover:text-red-300"
      >
        <X size={16} />
      </button>
    </div>
  );
}