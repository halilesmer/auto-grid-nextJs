'use client';

import { Download, Edit3, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import type { AccountActionsProps } from '../types';

export function AccountActions({
  activeAccount,
  isRunning,
  onEdit,
  onDelete,
  onDownloadLog,
  onAdd,
  disabled = false,
}: AccountActionsProps) {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5">
      {activeAccount && !disabled && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownloadLog}
            title={t('account.action.downloadLog')}
            aria-label={t('account.action.downloadLog')}
          >
            <Download size={14} />
            <span className="hidden sm:inline">{t('account.action.log')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isRunning}
            title={isRunning ? t('account.action.editBlocked') : t('account.action.editTitle')}
            aria-label={isRunning ? t('account.action.editBlocked') : t('account.action.editTitle')}
          >
            <Edit3 size={14} />
            <span className="hidden sm:inline">{t('account.action.edit')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isRunning}
            className="text-danger hover:bg-danger/10 hover:text-danger"
            title={isRunning ? t('account.action.deleteBlocked') : t('account.action.deleteTitle')}
            aria-label={isRunning ? t('account.action.deleteBlocked') : t('account.action.deleteTitle')}
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">{t('account.action.delete')}</span>
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
        </>
      )}
      <Button variant="primary" onClick={onAdd} aria-label={t('account.action.add')}>
        <Plus size={15} />
        <span>{t('account.action.new')}</span>
      </Button>
    </div>
  );
}
