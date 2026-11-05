'use client';
import { Waypoints } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { emptyChartDocument, useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';

/** Symbolleisten-Schalter „Formasyon çizimleri“ (FRM-45): schreibt dasselbe `overlays.formations` wie früher das Menü „Ebenen“. */
export function FormationDrawingsToggle({ contextKey, visible }: { contextKey: string; visible: boolean }) {
  const t = useT();
  return <Button size="icon-xs" variant={visible ? 'secondary' : 'ghost'} data-testid="formation-drawings-toggle" aria-pressed={visible} hint={t('cw.overlayFormations.hint')} aria-label={t('cw.overlayFormations')} onClick={() => {
    const state = useChartWorkspaceStore.getState(), doc = state.documents[contextKey] ?? emptyChartDocument();
    state.setDocument(contextKey, { ...doc, overlays: { ...doc.overlays, formations: !visible } });
  }}><Waypoints size={15} /></Button>;
}
