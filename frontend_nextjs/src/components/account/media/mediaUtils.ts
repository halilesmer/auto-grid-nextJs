import type { Formatters } from '@/i18n';
import type { MediaItem, MediaKind } from '@/services/mediaApi';

export const MEDIA_LIMIT = 3;
export const DEFAULT_MAX_BYTES: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  pdf: 10 * 1024 * 1024,
  note: 1024 * 1024,
};
/** 1107-A20.3: bu boyutun üstündeki JPEG/WebP, yüklemeden önce en uzun kenarı 2560 px'e küçültülür (PNG dokunulmaz). */
export const DOWNSCALE_OVER_BYTES = 2 * 1024 * 1024;
export const MAX_EDGE = 2560;
export const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown';

const ext = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

/** İstemci ön kontrolü (uzantı + tarayıcı türü); kesin karar worker'da ilk baytlara göre verilir. */
export function kindOfFile(file: Pick<File, 'name' | 'type'>): MediaKind | null {
  const e = file.name.includes('.') ? ext(file.name) : '';
  if (e === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(e)) return 'image';
  if (e === 'txt' || e === 'md') return 'note';
  return null;
}

/** Kartta görünen etiket: uzantıdan (JPEG → JPG). */
export function badgeOf(item: Pick<MediaItem, 'name' | 'kind'>): string {
  const e = item.name.includes('.') ? ext(item.name) : '';
  if (e === 'jpeg') return 'JPG';
  if (e) return e.toUpperCase();
  return { pdf: 'PDF', image: 'IMG', note: 'TXT' }[item.kind];
}

export function formatSize(f: Formatters, bytes: number): string {
  if (bytes < 1024) return `${f.number(bytes)} B`;
  if (bytes < 1024 * 1024) return `${f.number(Math.round(bytes / 1024))} KB`;
  return `${f.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} MB`;
}

export interface PreparedUpload {
  body: Blob;
  name: string;
  /** Küçültüldüyse özgün boyut */
  resizedFrom?: number;
}

/** 2 MB üstü JPEG/WebP'yi canvas ile küçültür; başarısız ya da daha büyük çıkarsa özgün dosya gider. */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const plain = { body: file, name: file.name };
  const lower = file.name.toLowerCase();
  const isJpeg = file.type === 'image/jpeg' || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  const isWebp = file.type === 'image/webp' || lower.endsWith('.webp');
  if (file.size <= DOWNSCALE_OVER_BYTES || !(isJpeg || isWebp)) return plain;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) {
      bitmap.close();
      return plain;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return plain;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const mime = isWebp ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.88));
    if (!blob || blob.size >= file.size) return plain;
    return { body: blob, name: file.name, resizedFrom: file.size };
  } catch {
    return plain;
  }
}

const SAFE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Blob türü: pdf → application/pdf, resim → izinli resim türü, not → düz metin; tutarsızsa null (önizleme reddedilir). */
export function safeMime(item: Pick<MediaItem, 'kind' | 'mime'>): string | null {
  if (item.kind === 'pdf') return item.mime === 'application/pdf' ? 'application/pdf' : null;
  if (item.kind === 'image') return SAFE_IMAGE.has(item.mime) ? item.mime : null;
  return 'text/plain';
}
