'use client';
import { Switch } from '@/components/ui/switch';
import { useT, type MessageKey } from '@/i18n';
import { emptyChartDocument, useChartWorkspaceStore } from '@/store/useChartWorkspaceStore';

export function useChartOverlays(key: string, defaults: Record<string, boolean>) {
  const saved = useChartWorkspaceStore(s => s.documents[key]?.overlays);
  return { ...defaults, ...saved };
}
export function ContextOverlays({ contextKey, options, values }: { contextKey: string; values: Record<string, boolean>; options: { key: string; label: MessageKey; hint: MessageKey }[] }) {
  const t = useT();
  return <div className="grid gap-4">{options.map(o => <Switch key={o.key} id={`overlay-${o.key}`} label={t(o.label)} hint={t(o.hint)} checked={values[o.key]} onChange={value => {
    const state = useChartWorkspaceStore.getState(), doc = state.documents[contextKey] ?? emptyChartDocument();
    state.setDocument(contextKey, { ...doc, overlays: { ...doc.overlays, [o.key]: value } });
  }} />)}</div>;
}
