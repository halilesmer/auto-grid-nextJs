import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useLogsStore } from '@/store';

/**
 * Hesabın log/state/ayar ZIP'ini indirir.
 *
 * window.open kullanılmaz: ngrok o istekte `ngrok-skip-browser-warning` başlığını
 * görmediği için ZIP yerine uyarı sayfası döner. Blob URL'si ise hemen iptal
 * edilmez; Safari aksi halde indirmeyi sessizce iptal ediyor.
 */
export async function downloadAccountLogs(accountId: string): Promise<void> {
  const pushActivity = useLogsStore.getState().pushActivity;
  pushActivity('info', `Preparing log archive for account ${accountId}…`);
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
    pushActivity('success', `Log archive downloaded (${Math.ceil(res.data.size / 1024)} KB).`);
  } catch (err) {
    const message = await getApiErrorMessage(err, 'Log download failed');
    pushActivity('error', message);
    window.alert(message);
  }
}
