/**
 * Tanı kancası (salt okunur ölçüm, 1117): Bibliyotek koşullarında nerede elendiğini saymak için. Kanca yokken hiçbir şey yapmaz,
 * hiçbir sonucu değiştirmez; yalnız canlı geçmiş taraması (e2e/live/formation-history.spec.ts) kurar.
 */
export interface DiagEvent {
  fn: 'early' | 'reentry';
  /** Aday anahtarı: Seite|A|B|C zamanları */
  key: string;
  /** early: en uzağa varılan aşama (3–8); reentry: çıkış adı */
  step: number | string;
}

let sink: ((e: DiagEvent) => void) | null = null;

export function setFormationDiag(fn: ((e: DiagEvent) => void) | null): void {
  sink = fn;
}

export function emitDiag(e: DiagEvent): void {
  sink?.(e);
}
