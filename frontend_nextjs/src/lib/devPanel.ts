/**
 * Geliştirme paneli (SYS-15): ayrı bir süreç, Mac'te `localhost:3030`. Ayarlar menüsündeki satır
 * yalnız bu Mac'in kendi localhost'unda görünür: Vercel'de ve telefonda (LAN adresi) `localhost`
 * başka bir makineyi gösterirdi.
 */
export const DEV_PANEL_URL = 'http://localhost:3030';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `window.location.hostname` bu makinenin kendisini mi gösteriyor (büyük/küçük harf fark etmez). */
export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.trim().toLowerCase());
}
