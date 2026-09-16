'use client';

import type { EnvTypeBadgeProps } from '../types';

export function EnvTypeBadge({ envType }: EnvTypeBadgeProps) {
  return (
    <span
      className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
        envType === 'LIVE'
          ? 'bg-red-500/20 text-red-400'
          : 'bg-blue-500/20 text-blue-400'
      }`}
    >
      {envType}
    </span>
  );
}