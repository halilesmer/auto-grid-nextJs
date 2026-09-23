'use client';

import { Badge } from '@/components/ui/badge';
import type { EnvTypeBadgeProps } from '../types';

export function EnvTypeBadge({ envType }: EnvTypeBadgeProps) {
  return (
    <Badge tone={envType === 'LIVE' ? 'danger' : 'info'}>
      <span className={`size-1.5 rounded-full ${envType === 'LIVE' ? 'bg-danger' : 'bg-info'}`} />
      {envType}
    </Badge>
  );
}
