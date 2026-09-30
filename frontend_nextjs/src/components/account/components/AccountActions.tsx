'use client';

import { Download, Edit3, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';
import type { AccountActionsProps } from '../types';

/** Alle Konto-Aktionen in einem Menü-Button (Log, Bearbeiten, Löschen, Neues Konto). */
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
    <DropdownMenu
      label={t('account.action.menu')}
      hint={t('account.action.menu.hint')}
      icon={<MoreHorizontal size={16} />}
    >
      {activeAccount && !disabled && (
        <DropdownMenuGroup>
          <DropdownMenuItem
            icon={<Download size={14} />}
            onSelect={onDownloadLog}
            hint={t('account.action.downloadLog.hint')}
            aria-label={t('account.action.downloadLog')}
          >
            {t('account.action.downloadLog')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Edit3 size={14} />}
            onSelect={onEdit}
            disabled={isRunning}
            hint={isRunning ? t('account.action.editBlocked') : t('account.action.edit.hint')}
            aria-label={isRunning ? t('account.action.editBlocked') : t('account.action.editTitle')}
          >
            {t('account.action.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Trash2 size={14} />}
            onSelect={onDelete}
            disabled={isRunning}
            tone="danger"
            hint={isRunning ? t('account.action.deleteBlocked') : t('account.action.delete.hint')}
            aria-label={isRunning ? t('account.action.deleteBlocked') : t('account.action.deleteTitle')}
          >
            {t('account.action.delete')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      )}
      <DropdownMenuGroup>
        <DropdownMenuItem
          icon={<Plus size={14} />}
          onSelect={onAdd}
          hint={t('account.action.add.hint')}
          aria-label={t('account.action.add')}
        >
          {t('account.action.new')}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
