import { useMemo } from 'react';
import { currenciesFromSymbols, effectiveCurrencies } from '@/lib/news';
import { useAccountStore } from '@/store/useAccountStore';
import { useNewsStore } from '@/store/useNewsStore';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * Para birimleri, haber kartının ve uyarı zamanlayıcısının ortak kaynağı. Hesabın zone sembollerinden varsayılan türetilir,
 * ama yalnız ayarlar başka yerde zaten yüklüyse (Dashboard); ayar çağrılmaz (ANA-16: serbest grafik /settings istemez).
 */
export function useNewsCurrencies() {
  const selectedAccount = useAccountStore((s) => s.selectedAccount);
  // Kontolar geldi ve hesap seçimi oturdu (ya da hiç hesap yok): daha önce istek gitmez, yoksa hesapsız + hesaplı iki istek çıkar
  const accountsSettled = useAccountStore((s) => s.accountsLoaded && (s.selectedAccount !== null || s.accounts.length === 0));
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const zones = useSettingsStore((s) => s.settings?.ZONES);
  const filter = useNewsStore((s) => s.filter);
  const symbolsKey = (loadedAccount === selectedAccount ? (zones ?? []) : []).map((z) => z.symbol).join(',');
  const derived = useMemo(() => currenciesFromSymbols(symbolsKey ? symbolsKey.split(',') : []), [symbolsKey]);
  const currencies = effectiveCurrencies(filter, derived);
  return { selectedAccount, accountsSettled, derived, currencies, currenciesKey: currencies.join(',') };
}
