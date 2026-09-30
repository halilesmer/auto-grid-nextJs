'use client';

import { Copy, KeyRound } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/animated-toast';
import { useT } from '@/i18n';
import { encodeConnectionCode, CONNECT_HASH_PREFIX, isLocalHost } from '@/lib/connectionCode';
import { useConnectionStore } from '@/store/useConnectionStore';
import type { IssuedKey } from '@/services/usersApi';

/**
 * Zeigt den frisch erzeugten Schlüssel genau einmal (der Worker speichert nur einen Hash) samt
 * fertigem Verbindungs-Link für den Benutzer: Adresse des Workers + persönlicher Schlüssel.
 */
export default function KeyRevealDialog({ issued, onClose }: { issued: IssuedKey | null; onClose: () => void }) {
  const t = useT();
  const baseUrl = useConnectionStore((s) => s.baseUrl);

  const key = issued?.key ?? '';
  const link =
    issued && baseUrl && typeof window !== 'undefined'
      ? `${window.location.origin}/${CONNECT_HASH_PREFIX}${encodeConnectionCode({ baseUrl, apiKey: key })}`
      : '';

  // Admin arbeitet lokal: der Link würde auf localhost zeigen und beim Benutzer ins Leere laufen
  const localOrigin = typeof window !== 'undefined' && isLocalHost(window.location.hostname);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('users.copied'));
    } catch {
      // Ohne Clipboard-Recht (unsicherer Kontext): das Feld bleibt markierbar
    }
  };

  return (
    <Modal
      open={Boolean(issued)}
      onClose={onClose}
      title={t('users.key.title', { name: issued?.user.name ?? '' })}
      icon={
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <KeyRound size={18} />
        </div>
      }
      className="max-w-lg"
    >
      <div className="space-y-4" data-testid="key-reveal">
        <Alert tone="warning">{t('users.key.warning')}</Alert>

        <InputField label={t('users.key.field')} hint={t('users.key.field.hint')}>
          <div className="flex items-center gap-2">
            <input className="input-s font-mono text-xs" data-testid="issued-key" readOnly value={key} onFocus={(e) => e.currentTarget.select()} />
            <Button
              size="icon"
              variant="secondary"
              aria-label={t('users.key.copy')}
              hint={t('users.key.copy.hint')}
              onClick={() => void copy(key)}
            >
              <Copy size={15} />
            </Button>
          </div>
        </InputField>

        {link && localOrigin && <Alert tone="info">{t('users.link.local')}</Alert>}

        {link && (
          <InputField label={t('users.link.field')} hint={t('users.link.field.hint')}>
            <div className="flex items-center gap-2">
              <input className="input-s font-mono text-xs" data-testid="issued-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <Button
                size="icon"
                variant="secondary"
                aria-label={t('users.link.copy')}
                hint={t('users.link.copy.hint')}
                onClick={() => void copy(link)}
              >
                <Copy size={15} />
              </Button>
            </div>
          </InputField>
        )}

        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose} data-testid="key-reveal-done" hint={t('users.key.done.hint')}>
            {t('users.key.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
