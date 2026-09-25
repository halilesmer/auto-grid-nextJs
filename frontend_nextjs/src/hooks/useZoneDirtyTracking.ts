'use client';

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ZoneSettings } from '@/store/types';
import { zoneModified } from '@/utils/zoneHelpers';

export interface UseZoneDirtyTrackingReturn {
  originalZones: ZoneSettings[];
  modified: (zone: ZoneSettings) => boolean;
  resetOriginalZones: () => void;
  setOriginalZones: Dispatch<SetStateAction<ZoneSettings[]>>;
}

export function useZoneDirtyTracking(
  zones: ZoneSettings[],
  isGlobalDirty?: boolean,
  accountKey?: string | null
): UseZoneDirtyTrackingReturn {
  const [originalZones, setOriginalZones] = useState<ZoneSettings[]>([]);
  const initializedRef = useRef(false);
  const accountKeyRef = useRef(accountKey);

  useEffect(() => {
    // Hesap değişince referans (kaydedilmiş) bölgeler yeni hesabın ayarlarından alınmalı
    if (accountKeyRef.current !== accountKey) {
      accountKeyRef.current = accountKey;
      initializedRef.current = false;
    }
    if (zones.length > 0 && !initializedRef.current) {
      setOriginalZones(zones.map((z) => ({ ...z })));
      initializedRef.current = true;
    }
  }, [zones, accountKey]);

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