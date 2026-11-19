/**
 * Tanı kancası (salt okunur ölçüm, 1117): Bibliyotek koşullarında nerede elendiğini saymak için. Kanca yokken hiçbir şey yapmaz,
 * hiçbir sonucu değiştirmez; yalnız canlı geçmiş taraması (e2e/live/formation-history.spec.ts) kurar.
 */
export interface DiagEvent {
  fn: 'early' | 'reentry' | 'earlyBand';
  /** Aday anahtarı: Seite|A|B|C zamanları */
  key: string;
  /** early: en uzağa varılan aşama (3–8); reentry: çıkış adı */
  step: number | string;
  /** earlyBand: Grund, warum die Stufe 3 (D im Band −0.272 … Level 1) scheitert */
  band?: {
    /** noBand: Band leer (Tiefe zu groß); notYet: Band da, D hat −0.272 nicht erreicht; other: sonst (z. B. Länge 0) */
    reason: 'noBand' | 'notYet' | 'other';
    /** Korrekturtiefe B → C als Anteil von AB */
    depth: number | null;
    /** notYet: Weg von C bis −0.272, den das D schon zurückgelegt hat (0 … 1) */
    progress: number | null;
  };
}

let sink: ((e: DiagEvent) => void) | null = null;

export function setFormationDiag(fn: ((e: DiagEvent) => void) | null): void {
  sink = fn;
}

export function emitDiag(e: DiagEvent): void {
  sink?.(e);
}
