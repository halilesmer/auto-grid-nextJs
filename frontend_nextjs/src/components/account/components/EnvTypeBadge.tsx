'use client';

import { Badge } from '@/components/ui/badge';
import { useT } from '@/i18n';
import type { EnvTypeBadgeProps } from '../types';

export function EnvTypeBadge({ envType }: EnvTypeBadgeProps) {
  const t = useT();
  return (
    <Badge
      tone={envType === 'LIVE' ? 'danger' : 'info'}
      hint={envType === 'LIVE' ? t('account.env.live.hint') : t('account.env.demo.hint')}
    >
      <span className={`size-1.5 rounded-full ${envType === 'LIVE' ? 'bg-danger' : 'bg-info'}`} />
      {envType}
    </Badge>
  );
}
