'use client';

import { useEffect, useRef } from 'react';
import { useBotRuntimeStore, useSettingsStore } from '@/store';
import { zoneApi } from '@/services/zoneApi';
import type { SymbolDetail } from '@/store/types';

/**
 * Seçili hesabın sembollerini bir kez çeker ve global store'a yazar.
 * - Hesap değişince eski hesabın sembolleri temizlenir ve yeniden çekilir.
 * - İlk çekimde liste boş geldiyse (MT5 kapalıydı), MT5 bağlanınca tekrar denenir.
 *
 * Not: isLoadingSymbols / availableSymbols bilerek bağımlılık listesinde DEĞİL.
 * Efekt kendi set ettiği loading state'i yüzünden yeniden çalışıp kendi isteğini
 * iptal ediyordu (sonsuz "Semboller yükleniyor...").
 */
export function useSymbolDetails(selectedAccount: string | null): Record<string, SymbolDetail> {
  const setAvailableSymbols = useSettingsStore((s) => s.setAvailableSymbols);
  const setSymbolDetails = useSettingsStore((s) => s.setSymbolDetails);
  const setLoadingSymbols = useSettingsStore((s) => s.setLoadingSymbols);
  const setSymbolsError = useSettingsStore((s) => s.setSymbolsError);
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const mt5Connected = useBotRuntimeStore((s) => s.liveData.mt5_connected);

  const lastFetchedAccountRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedAccount) {
      lastFetchedAccountRef.current = null;
      return;
    }

    const hasSymbols = useSettingsStore.getState().availableSymbols.length > 0;
    if (lastFetchedAccountRef.current === selectedAccount && hasSymbols) {
      return;
    }

    if (lastFetchedAccountRef.current !== selectedAccount) {
      // Önceki hesabın sembolleri yeni hesapta "Geçersiz Sembol" hatasına yol açmasın
      setAvailableSymbols([]);
      setSymbolDetails({});
      setSymbolsError(null);
    }
    lastFetchedAccountRef.current = selectedAccount;
    setLoadingSymbols(true);

    let cancelled = false;

    zoneApi
      .getSymbols(selectedAccount)
      .then(({ symbols: rawSymbols, error }) => {
        if (cancelled) return;
        let symsData = rawSymbols;

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
        setSymbolsError(syms.length === 0 ? error : null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Sembol detayları çekilemedi', err);
        setSymbolsError(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSymbols(false);
      });

    return () => {
      cancelled = true;
      setLoadingSymbols(false);
    };
  }, [selectedAccount, mt5Connected, setAvailableSymbols, setSymbolDetails, setLoadingSymbols, setSymbolsError]);

  return symbolDetails;
}
