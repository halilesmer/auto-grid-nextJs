'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, UserPlus, UsersRound } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import AdminOnly from '@/components/auth/AdminOnly';
import CreateUserDialog from '@/components/users/CreateUserDialog';
import KeyRevealDialog from '@/components/users/KeyRevealDialog';
import UsersTable from '@/components/users/UsersTable';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/animated-toast';
import { useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { usersApi, type IssuedKey } from '@/services/usersApi';
import { useUsersStore, type WorkerUser } from '@/store/useUsersStore';

function UsersView() {
  const t = useT();
  const users = useUsersStore((s) => s.users);
  const loaded = useUsersStore((s) => s.loaded);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createKey, setCreateKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);
  const [rotating, setRotating] = useState<WorkerUser | null>(null);
  const [deleting, setDeleting] = useState<WorkerUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await usersApi.fetchUsers();
    } catch (err) {
      setError(await getApiErrorMessage(err, t('users.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Laden beim Öffnen der Seite
    void load();
    // Nur beim Öffnen laden: `load` hängt an der Sprache, ein Sprachwechsel soll nicht neu laden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setCreateKey((k) => k + 1);
    setCreateOpen(true);
  };

  const rotate = async () => {
    if (!rotating) return;
    try {
      setIssued(await usersApi.rotateKey(rotating.id));
    } catch (err) {
      toast.error(await getApiErrorMessage(err, t('users.rotate.failed')), { title: t('common.error') });
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await usersApi.deleteUser(deleting.id);
    } catch (err) {
      toast.error(await getApiErrorMessage(err, t('users.delete.failed')), { title: t('common.error') });
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-xs text-muted-foreground">{t('users.eyebrow')}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{t('users.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('users.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon-sm" variant="ghost" onClick={() => void load()} aria-label={t('users.refresh')} hint={t('users.refresh.hint')}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
          <Button variant="primary" onClick={openCreate} data-testid="add-user" hint={t('users.add.hint')}>
            <UserPlus size={15} />
            {t('users.add')}
          </Button>
        </div>
      </header>

      {error && <Alert tone="danger">{error}</Alert>}

      {!loaded && loading && (
        <Card className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('users.loading')}
        </Card>
      )}
      {loaded && users.length === 0 && (
        <Card className="flex items-center gap-2 p-5 text-sm text-muted-foreground" data-testid="users-empty">
          <UsersRound size={16} className="shrink-0" />
          {t('users.empty')}
        </Card>
      )}
      {loaded && users.length > 0 && <UsersTable users={users} onRotate={setRotating} onDelete={setDeleting} />}

      <CreateUserDialog
        key={createKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) => {
          setCreateOpen(false);
          setIssued(result);
        }}
      />
      <KeyRevealDialog issued={issued} onClose={() => setIssued(null)} />

      <ConfirmModal
        open={Boolean(rotating)}
        onClose={() => setRotating(null)}
        onConfirm={rotate}
        title={t('users.rotate.title')}
        message={t('users.rotate.message', { name: rotating?.name ?? '' })}
        confirmLabel={t('users.rotate.confirm')}
        confirmHint={t('users.rotate.confirm.hint')}
        variant="warning"
      />
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={t('users.delete.title')}
        message={t('users.delete.message', { name: deleting?.name ?? '' })}
        infoText={t('users.delete.info')}
        confirmHint={t('users.delete.confirm.hint')}
        variant="danger"
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <AdminOnly waitForIdentity>
      <UsersView />
    </AdminOnly>
  );
}
