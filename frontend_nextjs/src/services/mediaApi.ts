import { axiosInstance } from '@/lib/api';

/** Worker: worker_python/src/api/media.py (1107-A20, ACC-12). Dosya baytı yalnız `download` ile iner. */
export type MediaKind = 'image' | 'pdf' | 'note';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  created_at: string;
}

export interface MediaList {
  items: MediaItem[];
  limit: number;
  max_bytes: Record<MediaKind, number>;
}

const base = (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/media`;

export const mediaApi = {
  /** Yalnız üst veri (bayt yok). */
  async list(accountId: string, signal?: AbortSignal): Promise<MediaList> {
    const res = await axiosInstance.get<MediaList>(base(accountId), { signal });
    return res.data;
  },

  /** Ham gövde (multipart yok); tür worker'da ilk baytlardan belirlenir. */
  async upload(
    accountId: string,
    body: Blob,
    name: string,
    opts: { signal?: AbortSignal; onProgress?: (loaded: number, total: number) => void } = {},
  ): Promise<MediaItem> {
    const res = await axiosInstance.post<MediaItem>(`${base(accountId)}?name=${encodeURIComponent(name)}`, body, {
      headers: { 'Content-Type': body.type || 'application/octet-stream' },
      signal: opts.signal,
      onUploadProgress: (e) => opts.onProgress?.(e.loaded, e.total ?? body.size),
    });
    return res.data;
  },

  /** Dosyayı blob olarak indirir: API anahtarı başlıkla gider, worker adresi <img>/window.open'a verilmez. */
  async download(
    accountId: string,
    mediaId: string,
    opts: { signal?: AbortSignal; onProgress?: (loaded: number) => void } = {},
  ): Promise<Blob> {
    const res = await axiosInstance.get<Blob>(`${base(accountId)}/${encodeURIComponent(mediaId)}`, {
      responseType: 'blob',
      signal: opts.signal,
      onDownloadProgress: (e) => opts.onProgress?.(e.loaded),
    });
    return res.data;
  },

  async remove(accountId: string, mediaId: string): Promise<void> {
    await axiosInstance.delete(`${base(accountId)}/${encodeURIComponent(mediaId)}`);
  },
};
