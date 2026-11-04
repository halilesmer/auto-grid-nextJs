'use client';

import { CandidateList } from '@/components/formation/CandidateList';
import { FormationChecklist } from '@/components/formation/FormationChecklist';
import { FormationTrade } from '@/components/formation/FormationTrade';
import { useT } from '@/i18n';
import type { ScanHit } from '@/lib/formation/scan';

/** Reiter „Bedingungen“ der Seitenleiste: Kandidaten als Umschalter, darunter die Checkliste des gewählten. */
export function FormationConditions({ list, hit, loading, tf, digits, active, onSelect, onActive }: {
  list: readonly ScanHit[];
  hit: ScanHit | null;
  loading: boolean;
  tf: string;
  /** Nachkommastellen des Symbols (für Preise und Pips im Handelsblock); null, solange unbekannt */
  digits: number | null;
  active: readonly string[] | null;
  onSelect: (hit: ScanHit) => void;
  onActive: (ids: string[] | null) => void;
}) {
  const t = useT();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="conditions-panel" id="formation-conditions">
      {list.length > 0 ? (
        <CandidateList hits={list} selected={hit} onSelect={onSelect} />
      ) : (
        <p className="px-3 py-2 text-xs text-muted-foreground" data-testid="candidate-empty">
          {loading ? t('formation.scan.loading') : t('formation.empty.list', { tf })}
        </p>
      )}
      {hit ? (
        <>
          <FormationTrade hit={hit} digits={digits} />
          <FormationChecklist hit={hit} active={active} onActive={onActive} />
        </>
      ) : !loading && (
        <p className="p-3 text-xs text-muted-foreground">{t('formation.empty.text', { tf })}</p>
      )}
    </div>
  );
}
