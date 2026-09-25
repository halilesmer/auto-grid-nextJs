import axios from 'axios';
import { t } from '@/i18n';

/**
 * Worker/ngrok hatalarını kullanıcıya gösterilebilir tek bir metne çevirir.
 * Blob gövdeleri (dosya indirme) okunabilsin diye async.
 */
export async function getApiErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error && err.message ? `${fallback}: ${err.message}` : fallback;
  }

  if (!err.response) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return `${fallback}: ${t('error.timeout')}`;
    }
    return `${fallback}: ${t('error.unreachable')}`;
  }

  const { status, headers } = err.response;
  let data: unknown = err.response.data;

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const text = await data.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } catch {
      data = null;
    }
  }

  const ngrokCode =
    (headers?.['ngrok-error-code'] as string | undefined) ||
    (typeof data === 'string' ? data.match(/ERR_NGROK_\d+/)?.[0] : undefined);
  if (ngrokCode) {
    return `${fallback}: ${t('error.ngrok', { code: ngrokCode })}`;
  }

  const detail = extractDetail(data);
  if (detail) return detail;

  return `${fallback} ${t('error.http', { status })}`;
}

function extractDetail(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const detail = (data as { detail?: unknown }).detail;

  if (typeof detail === 'string') return detail;

  // FastAPI 422: [{ loc, msg, type }]
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string; loc?: unknown[] };
    if (first?.msg) {
      const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
      return field ? `${field}: ${first.msg}` : first.msg;
    }
  }

  if (detail && typeof detail === 'object') {
    const obj = detail as { message?: string; detail?: string; code?: string };
    return obj.message || obj.detail || obj.code || JSON.stringify(detail);
  }

  return null;
}
