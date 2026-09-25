import { axiosInstance } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { useLogsStore } from '@/store';
import { t } from '@/i18n';

/**
 * Hesabın log/state/ayar ZIP'ini indirir.
 *
 * window.open kullanılmaz: ngrok o istekte `ngrok-skip-browser-warning` başlığını
 * görmediği için ZIP yerine uyarı sayfası döner. Blob URL'si ise hemen iptal
 * edilmez; Safari aksi halde indirmeyi sessizce iptal ediyor.
 */
export async function downloadAccountLogs(accountId: string): Promise<void> {
  const pushActivity = useLogsStore.getState().pushActivity;
  pushActivity('info', t('logs.download.preparing', { account: accountId }));
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
    pushActivity('success', t('logs.download.done', { size: Math.ceil(res.data.size / 1024) }));
  } catch (err) {
    const message = await getApiErrorMessage(err, t('logs.download.failed'));
    pushActivity('error', message);
    window.alert(message);
  }
}
