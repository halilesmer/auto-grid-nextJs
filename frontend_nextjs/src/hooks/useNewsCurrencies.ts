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
  // Kontolar geldi: daha önce istek gitmez. Hesap seçimi birkaç yüz ms sonra oturabilir; çağıranların bekleme süresi (SETTLE_MS)
  // hesapsız + hesaplı iki isteği birleştirir. Hesap hiç seçilmezse (Dashboard önseçmez) istek yine gider: tüm para birimleri.
  const accountsSettled = useAccountStore((s) => s.accountsLoaded);
  const loadedAccount = useSettingsStore((s) => s.loadedAccount);
  const zones = useSettingsStore((s) => s.settings?.ZONES);
  const filter = useNewsStore((s) => s.filter);
  const symbolsKey = (loadedAccount === selectedAccount ? (zones ?? []) : []).map((z) => z.symbol).join(',');
  const derived = useMemo(() => currenciesFromSymbols(symbolsKey ? symbolsKey.split(',') : []), [symbolsKey]);
  const currencies = effectiveCurrencies(filter, derived);
  return { selectedAccount, accountsSettled, derived, currencies, currenciesKey: currencies.join(',') };
}
