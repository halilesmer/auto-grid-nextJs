'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/animated-toast';
import { useT } from '@/i18n';
import { getApiErrorMessage } from '@/lib/apiError';
import { usersApi, type IssuedKey } from '@/services/usersApi';

const MAX_NAME_LENGTH = 40;

// Die Seite hängt den Dialog pro Öffnen neu ein (key), damit Name und Zustand leer starten
export default function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (issued: IssuedKey) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      onCreated(await usersApi.createUser(trimmed));
    } catch (err) {
      toast.error(await getApiErrorMessage(err, t('users.create.failed')), { title: t('common.error') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} dismissible={!busy} title={t('users.create.title')}>
      <form
        className="space-y-4"
        data-testid="create-user-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <InputField label={t('users.create.name')} hint={t('users.create.name.hint')}>
          <input
            className="input-s"
            data-testid="create-user-name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('users.create.name.placeholder')}
            autoComplete="off"
            autoFocus
          />
        </InputField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy} hint={t('common.cancel.hint')}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!trimmed}
            data-testid="create-user-submit"
            hint={t('users.create.submit.hint')}
          >
            {t('users.create.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
