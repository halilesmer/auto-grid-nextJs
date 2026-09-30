'use client';

import { KeyRound, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFormat, useT } from '@/i18n';
import type { WorkerUser } from '@/store/useUsersStore';

export default function UsersTable({
  users,
  onRotate,
  onDelete,
}: {
  users: WorkerUser[];
  onRotate: (user: WorkerUser) => void;
  onDelete: (user: WorkerUser) => void;
}) {
  const t = useT();
  const fmt = useFormat();

  return (
    <Card className="overflow-hidden" data-testid="users-table">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">{t('users.col.name')}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t('users.col.accounts')}</th>
              <th scope="col" className="px-4 py-3 font-medium">{t('users.col.created')}</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">{t('users.col.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} data-testid="user-row" className="border-b border-border last:border-b-0">
                <td className="max-w-[14rem] truncate px-4 py-3 font-medium text-foreground" data-testid="user-name">
                  {user.name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground" data-testid="user-accounts">
                  {fmt.number(user.account_count)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{user.created_at ? fmt.dateTime(user.created_at) : '–'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="user-rotate"
                      aria-label={t('users.action.newKey')}
                      onClick={() => onRotate(user)}
                      hint={t('users.action.newKey.hint')}
                    >
                      <KeyRound size={13} />
                      <span className="hidden sm:inline">{t('users.action.newKey')}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid="user-delete"
                      aria-label={t('users.action.delete')}
                      onClick={() => onDelete(user)}
                      hint={t('users.action.delete.hint')}
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">{t('users.action.delete')}</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
