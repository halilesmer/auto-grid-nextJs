'use client';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useT, type MessageKey } from '@/i18n';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'error';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  title: string;
  message: string;
  infoText?: string;
  confirmLabel?: string;
  /** Pflicht (hooks/RULES.md §5): was passiert, wenn man bestätigt. */
  confirmHint: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  showCancel?: boolean;
  /** Optionale zweite Wahl neben der Bestätigung (z. B. „behalten“ statt „löschen“); hint wie confirmHint Pflicht */
  secondary?: { label: string; hint: string; onClick: () => void | Promise<void> };
}

const variantConfig: Record<
  ConfirmVariant,
  { icon: typeof Info; iconBox: string; button: 'danger' | 'warning' | 'primary' }
> = {
  danger: { icon: AlertTriangle, iconBox: 'bg-danger/15 text-danger', button: 'danger' },
  warning: { icon: AlertTriangle, iconBox: 'bg-warning/15 text-warning', button: 'warning' },
  info: { icon: Info, iconBox: 'bg-info/15 text-info', button: 'primary' },
  error: { icon: XCircle, iconBox: 'bg-danger/15 text-danger', button: 'danger' },
};

const defaultLabels: Record<ConfirmVariant, MessageKey> = {
  danger: 'confirm.delete',
  warning: 'confirm.confirm',
  info: 'confirm.ok',
  error: 'confirm.ok',
};

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  infoText,
  confirmLabel,
  confirmHint,
  cancelLabel,
  variant = 'danger',
  loading = false,
  showCancel = true,
  secondary,
}: ConfirmModalProps) {
  const t = useT();
  const cfg = variantConfig[variant];
  const Icon = cfg.icon;
  const label = confirmLabel || t(defaultLabels[variant]);

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    if (!loading) {
      onClose();
    }
  };

  const handleSecondary = async () => {
    await secondary?.onClick();
    if (!loading) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={showCancel && !loading}
      title={title}
      icon={
        <div className={cn('flex size-9 items-center justify-center rounded-lg', cfg.iconBox)}>
          <Icon size={18} />
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>

      {infoText && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
          <Info size={14} className="mt-0.5 shrink-0 text-info" />
          <span>{infoText}</span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {showCancel && (
          <Button variant="ghost" onClick={onClose} disabled={loading} hint={t('common.cancel.hint')}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
        )}
        {secondary && (
          <Button variant="outline" onClick={handleSecondary} disabled={loading} hint={secondary.hint}>
            {secondary.label}
          </Button>
        )}
        <Button variant={cfg.button} onClick={handleConfirm} loading={loading} hint={confirmHint}>
          {label}
        </Button>
      </div>
    </Modal>
  );
}
