'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import AdminOnly from '@/components/auth/AdminOnly';
import { Card } from '@/components/ui/card';
import { useT } from '@/i18n';
import { useSettingsDialogStore } from '@/store/useSettingsDialogStore';

/**
 * /vps artık ayarlardaki „VPS ve sistem“ bölümüdür (plan 1115-A9.6). Rota eski bağlantılar ve yer imleri için kalır:
 * uygulamayı açar ve ayar penceresini o bölümde açar. Admin olmayan bugünkü erişim kuralını görür (AdminOnly).
 */
function VpsRedirect() {
  const t = useT();
  const router = useRouter();
  const show = useSettingsDialogStore((s) => s.show);
  useEffect(() => {
    show('system');
    router.replace('/');
  }, [show, router]);
  return (
    <Card className="mx-auto mt-8 flex max-w-xl items-center gap-3 p-5 text-sm text-muted-foreground" data-testid="vps-redirect">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {t('vps.redirect')}
    </Card>
  );
}

export default function VpsPage() {
  return (
    <AdminOnly>
      <VpsRedirect />
    </AdminOnly>
  );
}
