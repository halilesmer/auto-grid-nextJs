'use client';

import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react';
import type { ZoneSettings } from '@/store/types';
import { zoneModified } from '@/utils/zoneHelpers';

export interface UseZoneDirtyTrackingReturn {
  originalZones: ZoneSettings[];
  /** Referans (kaydedilmiş) bölgeler yüklendi mi; öncesinde `modified` her setup için true döner ve yanlış alarm olur */
  ready: boolean;
  modified: (zone: ZoneSettings) => boolean;
  /** Kaydedilmiş hâl; hiç kaydedilmemiş (yeni) setup için undefined */
  original: (zoneId: string) => ZoneSettings | undefined;
  /** Setup'ı kaydedilmiş hâline döndürür (is_active kendi kaydetme yoluna sahip, o yüzden korunur); yeni setup için null */
  revertedZone: (zone: ZoneSettings) => ZoneSettings | null;
  resetOriginalZones: () => void;
  setOriginalZones: Dispatch<SetStateAction<ZoneSettings[]>>;
}

export function useZoneDirtyTracking(
  zones: ZoneSettings[],
  isGlobalDirty?: boolean,
  accountKey?: string | null
): UseZoneDirtyTrackingReturn {
  const [originalZones, setOriginalZones] = useState<ZoneSettings[]>([]);
  const [ready, setReady] = useState(false);
  const initializedRef = useRef(false);
  const accountKeyRef = useRef(accountKey);

  useEffect(() => {
    // Hesap değişince referans (kaydedilmiş) bölgeler yeni hesabın ayarlarından alınmalı
    if (accountKeyRef.current !== accountKey) {
      accountKeyRef.current = accountKey;
      initializedRef.current = false;
      setReady(false);
    }
    if ((zones.length > 0 || isGlobalDirty === false) && !initializedRef.current) {
      setOriginalZones(zones.map((z) => ({ ...z })));
      initializedRef.current = true;
      setReady(true);
    }
  }, [zones, accountKey, isGlobalDirty]);

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

  const original = useCallback((zoneId: string) => originalZones.find((z) => z.id === zoneId), [originalZones]);

  const revertedZone = useCallback(
    (zone: ZoneSettings): ZoneSettings | null => {
      const orig = originalZones.find((z) => z.id === zone.id);
      return orig ? { ...orig, is_active: zone.is_active } : null;
    },
    [originalZones]
  );

  const resetOriginalZones = useCallback(() => {
    setOriginalZones(zones.map((z) => ({ ...z })));
  }, [zones]);

  return { originalZones, ready, modified, original, revertedZone, resetOriginalZones, setOriginalZones };
}