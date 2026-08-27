'use client';
import { AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'error';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title: string;
  message: string;
  infoText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  showCancel?: boolean;
}

const variantConfig: Record<ConfirmVariant, { icon: React.FC<{ size: number; color: string }>; iconColor: string; confirmBg: string; confirmHover: string }> = {
  danger: {
    icon: AlertTriangle,
    iconColor: '#f87171',
    confirmBg: 'bg-red-600',
    confirmHover: 'hover:bg-red-500',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: '#facc15',
    confirmBg: 'bg-yellow-600',
    confirmHover: 'hover:bg-yellow-500',
  },
  info: {
    icon: Info,
    iconColor: '#60a5fa',
    confirmBg: 'bg-blue-600',
    confirmHover: 'hover:bg-blue-500',
  },
  error: {
    icon: XCircle,
    iconColor: '#f87171',
    confirmBg: 'bg-red-600',
    confirmHover: 'hover:bg-red-500',
  },
};

const defaultLabels: Record<ConfirmVariant, string> = {
  danger: 'Delete',
  warning: 'Confirm',
  info: 'OK',
  error: 'OK',
};

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  infoText,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  showCancel = true,
}: ConfirmModalProps) {
  if (!open) return null;

  const cfg = variantConfig[variant];
  const Icon = cfg.icon;
  const label = confirmLabel || defaultLabels[variant];

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    if (!loading) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center space-x-3 mb-4">
          <Icon size={24} color={cfg.iconColor} />
          <h3 className="text-lg font-bold text-white flex-1">{title}</h3>
          {showCancel && (
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={18} />
            </button>
          )}
        </div>

        <p className="text-gray-300 mb-2">{message}</p>

        {infoText && (
          <div className="mb-4 p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 flex items-start space-x-2">
            <Info size={16} color="#60a5fa" className="mt-0.5 shrink-0" />
            <span>{infoText}</span>
          </div>
        )}

        <div className="flex justify-end space-x-3">
          {showCancel && (
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-6 py-2 ${cfg.confirmBg} ${cfg.confirmHover} text-white font-semibold rounded-lg transition-all active:scale-95 disabled:opacity-50`}
          >
            {loading ? '...' : label}
          </button>
        </div>
      </div>
    </div>
  );
}
