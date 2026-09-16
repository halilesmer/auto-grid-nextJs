'use client';

import { Download, Edit3, Trash2, Plus } from 'lucide-react';
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
    <div className="flex items-center space-x-2">
      {activeAccount && !disabled && (
        <>
          <button
            onClick={onDownloadLog}
            className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-all"
            title="Download bot log"
            aria-label="Download bot log"
          >
            <Download size={14} />
            <span>Log</span>
          </button>
          <button
            onClick={onEdit}
            disabled={isRunning}
            className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-white/10 transition-all"
            title={isRunning ? 'Stop the bot before editing' : 'Edit account'}
            aria-label={isRunning ? 'Stop the bot before editing' : 'Edit account'}
          >
            <Edit3 size={14} />
            <span>Edit</span>
          </button>
          <button
            onClick={onDelete}
            disabled={isRunning}
            className="flex items-center space-x-1 text-xs text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-red-500/10 transition-all"
            title={isRunning ? 'Stop the bot before deleting' : 'Delete account'}
            aria-label={isRunning ? 'Stop the bot before deleting' : 'Delete account'}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </>
      )}
      <button
        onClick={onAdd}
        className="flex items-center space-x-1 text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded-lg transition-all active:scale-95"
        aria-label="Add new account"
      >
        <Plus size={16} />
        <span>New Account</span>
      </button>
    </div>
  );
}