'use client';

import { Download, Edit3, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  return (
    <div className="flex items-center gap-1.5">
      {activeAccount && !disabled && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownloadLog}
            title="Download bot log"
            aria-label="Download bot log"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Log</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isRunning}
            title={isRunning ? 'Stop the bot before editing' : 'Edit account'}
            aria-label={isRunning ? 'Stop the bot before editing' : 'Edit account'}
          >
            <Edit3 size={14} />
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={isRunning}
            className="text-danger hover:bg-danger/10 hover:text-danger"
            title={isRunning ? 'Stop the bot before deleting' : 'Delete account'}
            aria-label={isRunning ? 'Stop the bot before deleting' : 'Delete account'}
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Delete</span>
          </Button>
          <div className="mx-1 h-6 w-px bg-border" />
        </>
      )}
      <Button variant="primary" onClick={onAdd} aria-label="Add new account">
        <Plus size={15} />
        <span>New Account</span>
      </Button>
    </div>
  );
}
