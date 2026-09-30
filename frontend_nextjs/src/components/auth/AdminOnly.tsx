'use client';

import type { ReactNode } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useT } from '@/i18n';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Zeigt den Inhalt nur Administratoren (Schlüssel = WORKER_API_KEY). Die eigentliche Sperre liegt im
 * Worker (403); das hier erspart Benutzern nur Seiten, die bei ihnen ohnehin Fehler zeigen würden.
 * `waitForIdentity`: solange die Rolle unbekannt ist (noch nicht geladen / nicht verbunden), erst warten
 * statt anzeigen. Ohne (z. B. /vps, läuft auch ohne Worker) gilt „unbekannt" als erlaubt.
 */
export default function AdminOnly({
  children,
  waitForIdentity = false,
}: {
  children: ReactNode;
  waitForIdentity?: boolean;
}) {
  const t = useT();
  const me = useAuthStore((s) => s.me);

  if (!me) {
    if (!waitForIdentity) return <>{children}</>;
    return (
      <Card className="mx-auto mt-8 flex max-w-xl items-center gap-3 p-5 text-sm text-muted-foreground" data-testid="admin-checking">
        <Loader2 className="size-4 animate-spin" />
        {t('auth.checking')}
      </Card>
    );
  }
  if (me.role !== 'admin') {
    return (
      <Card className="mx-auto mt-8 max-w-xl p-5" data-testid="admin-only">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldAlert size={16} className="text-warning" />
          {t('auth.adminOnly.title')}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth.adminOnly.body')}</p>
      </Card>
    );
  }
  return <>{children}</>;
}
