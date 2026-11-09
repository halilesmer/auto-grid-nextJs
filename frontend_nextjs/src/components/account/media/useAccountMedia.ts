'use client';

import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormat, useT } from '@/i18n';
import { getApiErrorMessage, isAbortError } from '@/lib/apiError';
import { mediaApi, type MediaItem, type MediaKind } from '@/services/mediaApi';
import { DEFAULT_MAX_BYTES, MEDIA_LIMIT, formatSize, kindOfFile, prepareUpload, safeMime } from './mediaUtils';

export type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: MediaItem[]; limit: number; maxBytes: Record<MediaKind, number> };

export interface UploadState {
  name: string;
  /** 0–100; null: dosya henüz hazırlanıyor (küçültme) */
  percent: number | null;
  /** "Küçültüldü: 4,8 → 0,9 MB" gibi satır */
  notice?: string;
}

export type PreviewState =
  | { item: MediaItem; phase: 'loading'; loaded: number }
  | { item: MediaItem; phase: 'error'; message: string }
  | { item: MediaItem; phase: 'ready'; url: string; text?: string };

interface CachedFile {
  url: string;
  text?: string;
}

/** Worker `detail` metni (çevrilmez); ağ hatasında kısa neden. Baştaki ": " kalıntısı atılır. */
async function detailOf(err: unknown): Promise<string> {
  return (await getApiErrorMessage(err, '')).replace(/^[:\s]+/, '');
}

/** Oturum içi önbellekte tutulan en çok blob sayısı (hesap başına zaten 3 dosya var). */
const CACHE_MAX = 3;

/**
 * Hesap medyası durumu (yerel state; mutasyondan sonra liste yeniden çekilir). Açılışta yalnız liste gelir;
 * dosya baytı yalnız `openPreview` ile iner, ikinci açılışta önbellekten gelir (ACC-13).
 */
export function useAccountMedia(accountId: string) {
  const t = useT();
  const f = useFormat();
  const [list, setList] = useState<ListState>({ status: 'loading' });
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const cache = useRef(new Map<string, CachedFile>());
  const previewAbort = useRef<AbortController | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const listSeq = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const removing = useRef(false);

  const reload = useCallback(async () => {
    const seq = ++listSeq.current;
    setList({ status: 'loading' });
    try {
      const data = await mediaApi.list(accountId);
      if (seq !== listSeq.current) return;
      setList({ status: 'ready', items: data.items, limit: data.limit ?? MEDIA_LIMIT, maxBytes: data.max_bytes ?? DEFAULT_MAX_BYTES });
    } catch (err) {
      const message = await getApiErrorMessage(err, t('media.loadFailed'));
      if (seq !== listSeq.current) return;
      setList({ status: 'error', message });
    }
  }, [accountId, t]);

  /** Mutasyondan sonra: liste sessizce tazelenir (iskelet yanıp sönmesin). */
  const refresh = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const data = await mediaApi.list(accountId);
      if (seq !== listSeq.current) return;
      setList({ status: 'ready', items: data.items, limit: data.limit ?? MEDIA_LIMIT, maxBytes: data.max_bytes ?? DEFAULT_MAX_BYTES });
    } catch (err) {
      const message = await getApiErrorMessage(err, t('media.loadFailed'));
      if (seq !== listSeq.current) return;
      setList({ status: 'error', message });
    }
  }, [accountId, t]);

  useEffect(() => {
    const files = cache.current;
    const seq = listSeq;
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Liste beim Öffnen laden (nur Metadaten, keine Dateien)
    void refresh();
    return () => {
      seq.current++;
      mounted.current = false;
      // Süren yükleme bilerek iptal edilmez: form Kaydet ile kapansa da dosya yüklenir (ekran durumu güncellenmez)
      previewAbort.current?.abort();
      for (const entry of files.values()) URL.revokeObjectURL(entry.url);
      files.clear();
    };
    // refresh hängt von t ab; ein Sprachwechsel soll die Liste nicht neu laden (AccountMedia bekommt key=accountId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const evict = (id: string) => {
    const entry = cache.current.get(id);
    if (!entry) return;
    URL.revokeObjectURL(entry.url);
    cache.current.delete(id);
  };

  const closePreview = useCallback(() => {
    previewAbort.current?.abort();
    previewAbort.current = null;
    setPreview(null);
  }, []);

  const openPreview = useCallback(
    async (item: MediaItem) => {
      previewAbort.current?.abort();
      const cached = cache.current.get(item.id);
      if (cached) {
        setPreview({ item, phase: 'ready', url: cached.url, text: cached.text });
        return;
      }
      const ctrl = new AbortController();
      previewAbort.current = ctrl;
      setPreview({ item, phase: 'loading', loaded: 0 });
      try {
        const raw = await mediaApi.download(accountId, item.id, {
          signal: ctrl.signal,
          onProgress: (loaded) => setPreview((p) => (p && p.item.id === item.id && p.phase === 'loading' ? { ...p, loaded } : p)),
        });
        // Tür istemcide `kind`'dan türetilir: tutarsız bir yanıt (ör. pdf + text/html) frontend origin'inde çalışmasın
        const safeType = safeMime(item);
        if (!safeType) throw new Error(t('media.preview.failed'));
        const blob = new Blob([raw], { type: safeType });
        const text = item.kind === 'note' ? await blob.text() : undefined;
        if (ctrl.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        while (cache.current.size >= CACHE_MAX) evict(cache.current.keys().next().value as string);
        cache.current.set(item.id, { url, text });
        setPreview({ item, phase: 'ready', url, text });
      } catch (err) {
        if (isAbortError(err) || ctrl.signal.aborted) return;
        const message = await getApiErrorMessage(err, t('media.preview.failed'));
        if (ctrl.signal.aborted) return;
        setPreview({ item, phase: 'error', message });
      }
    },
    [accountId, t],
  );

  /** Worker durum kodundan istemci metni; bilinmeyen hata: worker `detail` (çevrilmez). */
  const uploadError = useCallback(
    async (err: unknown, name: string, kind: MediaKind, maxBytes: Record<MediaKind, number>, limit: number) => {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const lead = t('media.error.failed', { name });
      if (status === 415) return `${lead} ${t('media.error.type')}`;
      if (status === 413) return `${lead} ${t('media.error.size', { max: formatSize(f, maxBytes[kind]) })}`;
      if (status === 409) return `${lead} ${t('media.error.limit', { limit })}`;
      return `${lead} ${await detailOf(err)}`.trim();
    },
    [f, t],
  );

  const addFile = useCallback(
    async (file: File) => {
      if (busy.current || list.status !== 'ready') return;
      const { items, limit, maxBytes } = list;
      const kind = kindOfFile(file);
      if (items.length >= limit) {
        setError(t('media.error.limit', { limit }));
        return;
      }
      const lead = t('media.error.failed', { name: file.name });
      if (!kind) {
        setError(`${lead} ${t('media.error.type')}`);
        return;
      }
      if (file.size === 0) {
        setError(`${lead} ${t('media.error.empty')}`);
        return;
      }
      // 2 MB üstü JPEG/WebP küçültüleceği için 10 MB'lık sınırı özgün boyuta değil, hazırlanan dosyaya uygula
      const mayShrink = kind === 'image' && /\.(jpe?g|webp)$/i.test(file.name);
      if (file.size > maxBytes[kind] && !mayShrink) {
        setError(`${lead} ${t('media.error.size', { max: formatSize(f, maxBytes[kind]) })}`);
        return;
      }
      busy.current = true;
      setError(null);
      const ctrl = new AbortController();
      uploadAbort.current = ctrl;
      setUpload({ name: file.name, percent: null });
      try {
        const prepared = await prepareUpload(file);
        if (ctrl.signal.aborted) return;
        if (prepared.body.size > maxBytes[kind]) {
          if (mounted.current) setError(`${lead} ${t('media.error.size', { max: formatSize(f, maxBytes[kind]) })}`);
          return;
        }
        const notice = prepared.resizedFrom
          ? t('media.upload.resized', { from: formatSize(f, prepared.resizedFrom), to: formatSize(f, prepared.body.size) })
          : undefined;
        setUpload({ name: file.name, percent: 0, notice });
        await mediaApi.upload(accountId, prepared.body, prepared.name, {
          signal: ctrl.signal,
          onProgress: (loaded, total) =>
            setUpload((u) => (u ? { ...u, percent: Math.min(100, Math.round((loaded / Math.max(total, 1)) * 100)) } : u)),
        });
      } catch (err) {
        if (!isAbortError(err) && !ctrl.signal.aborted) {
          const message = await uploadError(err, file.name, kind, maxBytes, limit);
          if (mounted.current) setError(message);
        }
      } finally {
        busy.current = false;
        uploadAbort.current = null;
        if (mounted.current) {
          // Başarıda yeni öğe, hatada (ör. 409) gerçek sayı: liste önce tazelenir, sonra yükleme kartı kalkar (boşluk kalmasın)
          await refresh();
          if (mounted.current) setUpload(null);
        }
      }
    },
    [accountId, f, list, refresh, t, uploadError],
  );

  const cancelUpload = useCallback(() => uploadAbort.current?.abort(), []);

  const removeItem = useCallback(
    async (item: MediaItem) => {
      if (removing.current) return;
      removing.current = true;
      try {
        await mediaApi.remove(accountId, item.id);
        evict(item.id);
        setError(null);
      } catch (err) {
        setError(`${t('media.error.deleteFailed', { name: item.name })} ${await detailOf(err)}`.trim());
      } finally {
        removing.current = false;
      }
      await refresh();
    },
    [accountId, refresh, t],
  );

  return {
    list,
    error,
    setError,
    upload,
    preview,
    reload,
    openPreview,
    closePreview,
    addFile,
    cancelUpload,
    removeItem,
  };
}
