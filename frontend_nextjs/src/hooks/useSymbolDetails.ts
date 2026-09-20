'use client';

import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store';
import { zoneApi } from '@/services/zoneApi';
import type { SymbolDetail } from '@/store/types';

export function useSymbolDetails(selectedAccount: string | null): Record<string, SymbolDetail> {
  const setAvailableSymbols = useSettingsStore((s) => s.setAvailableSymbols);
  const setSymbolDetails = useSettingsStore((s) => s.setSymbolDetails);
  const setLoadingSymbols = useSettingsStore((s) => s.setLoadingSymbols);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const availableSymbols = useSettingsStore((s) => s.availableSymbols);
  const isLoadingSymbols = useSettingsStore((s) => s.isLoadingSymbols);

  const lastFetchedAccountRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedAccount) {
      lastFetchedAccountRef.current = null;
      return;
    }

    // Guard: already fetched for this account and have data
    if (
      lastFetchedAccountRef.current === selectedAccount &&
      availableSymbols.length > 0
    ) {
      return;
    }

    // Guard: already loading for this account
    if (isLoadingSymbols && lastFetchedAccountRef.current === selectedAccount) {
      return;
    }

    // Cancel previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    lastFetchedAccountRef.current = selectedAccount;
    setLoadingSymbols(true);

    let cancelled = false;

    zoneApi
      .getSymbols(selectedAccount)
      .then((symsData) => {
        if (cancelled || abortController.signal.aborted) return;

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
      .catch((err) => {
        if (err.name === 'AbortError' || abortController.signal.aborted) return;
        console.error('Sembol detayları çekilemedi', err);
      })
      .finally(() => {
        if (!cancelled && !abortController.signal.aborted) {
          setLoadingSymbols(false);
        }
      });

    return () => {
      cancelled = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [selectedAccount, setAvailableSymbols, setSymbolDetails, setLoadingSymbols, availableSymbols.length, isLoadingSymbols]);

  return symbolDetails;
}