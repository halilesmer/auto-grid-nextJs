import axios from 'axios';
import { axiosInstance } from '@/lib/api';

/**
 * Hesabın log/state/ayar ZIP'ini indirir.
 *
 * window.open kullanılmaz: ngrok o istekte `ngrok-skip-browser-warning` başlığını
 * görmediği için ZIP yerine uyarı sayfası döner. Blob URL'si ise hemen iptal
 * edilmez; Safari aksi halde indirmeyi sessizce iptal ediyor.
 */
export async function downloadAccountLogs(accountId: string): Promise<void> {
  try {
    const res = await axiosInstance.get(`/logs/download/${accountId}`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(
      new Blob([res.data], { type: 'application/zip' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `MT5_Logs_and_Configs_${accountId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error('Log download failed', err);
    let detail = 'Log download failed.';
    if (axios.isAxiosError(err)) {
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          detail = JSON.parse(await data.text()).detail || detail;
        } catch {
          // JSON olmayan hata gövdesi
        }
      } else if (!err.response) {
        detail = 'Log download failed: worker not reachable.';
      }
    }
    window.alert(detail);
  }
}
