'use client';

import { useEffect } from 'react';
import { useSettingsStore } from '@/store';
import { zoneApi } from '@/services/zoneApi';
import type { SymbolDetail } from '@/store/types';

export function useSymbolDetails(selectedAccount: string | null): Record<string, SymbolDetail> {
  const setAvailableSymbols = useSettingsStore((s) => s.setAvailableSymbols);
  const setSymbolDetails = useSettingsStore((s) => s.setSymbolDetails);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);

  useEffect(() => {
    if (!selectedAccount) return;

    let cancelled = false;

    zoneApi
      .getSymbols(selectedAccount)
      .then((symsData) => {
        if (cancelled) return;

        if (typeof symsData === 'string') {
          try {
            symsData = JSON.parse(symsData);
          } catch {
            symsData = {};
          }
        }

        const syms: SymbolDetail[] = Array.isArray(symsData)
          ? symsData.map((s) => (typeof s === 'string' ? { name: s } : s))
          : Object.entries(symsData).map(([key, val]) => {
              const detail = (typeof val === 'object' ? val : {}) as Omit<SymbolDetail, 'name'>;
              return { name: key, ...detail } as SymbolDetail;
            });

        setAvailableSymbols(syms.map((s) => s.name));
        const details: Record<string, SymbolDetail> = {};
        syms.forEach((s) => {
          if (s.name) details[s.name.toUpperCase()] = s;
        });
        setSymbolDetails(details);
      })
      .catch((err) => console.error('Sembol detayları çekilemedi', err));

    return () => {
      cancelled = true;
    };
  }, [selectedAccount, setAvailableSymbols, setSymbolDetails]);

  return symbolDetails;
}