'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ZoneSettings } from '@/store/useBotStore';
import { zoneModified } from '@/utils/zoneHelpers';

export interface UseZoneDirtyTrackingReturn {
  originalZones: ZoneSettings[];
  modified: (zone: ZoneSettings) => boolean;
  resetOriginalZones: () => void;
  setOriginalZones: (zones: ZoneSettings[]) => void;
}

export function useZoneDirtyTracking(
  zones: ZoneSettings[],
  isGlobalDirty?: boolean
): UseZoneDirtyTrackingReturn {
  const [originalZones, setOriginalZones] = useState<ZoneSettings[]>([]);

  // Sync originalZones when zones load (initial mount or account change)
  // This runs during render, not in useEffect, to avoid cascading renders
  if (zones.length > 0 && originalZones.length === 0) {
    setOriginalZones(zones.map((z) => ({ ...z })));
  }

  useEffect(() => {
    if (isGlobalDirty === false) {
      queueMicrotask(() => {
        setOriginalZones(zones.map((z) => ({ ...z })));
      });
    }
  }, [isGlobalDirty, zones]);

  const modified = useCallback(
    (zone: ZoneSettings): boolean => {
      const origZone = originalZones.find((z) => z.id === zone.id);
      return zoneModified(origZone, zone);
    },
    [originalZones]
  );

  const resetOriginalZones = useCallback(() => {
    setOriginalZones(zones.map((z) => ({ ...z })));
  }, [zones]);

  return { originalZones, modified, resetOriginalZones, setOriginalZones };
}