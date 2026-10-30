import type { Drawing } from 'lightweight-charts-drawing';

export interface DrawingIdentity { source: string; account: string; symbol: string }
export const linkedDrawingKey = (identity: DrawingIdentity) => `@linked:${JSON.stringify([identity.source, identity.account, identity.symbol])}`;
export function parseDrawings(json: string): Drawing[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value) || value.some(d => !d || typeof d.id !== 'string' || !Array.isArray(d.points))) throw new Error('Invalid drawing document');
  return value;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Keep both versions when IDs collide. Repeated linking does not duplicate an identical version. */
export function mergeDrawings(shared: string, own: string): string {
  const drawings = parseDrawings(shared), known = new Set(drawings.map(d => canonical({ ...d, id: '' })));
  for (const drawing of parseDrawings(own)) {
    const previous = drawings.find(d => d.id === drawing.id);
    if (!previous) { drawings.push(drawing); known.add(canonical({ ...drawing, id: '' })); continue; }
    if (canonical(previous) === canonical(drawing) || known.has(canonical({ ...drawing, id: '' }))) continue;
    drawings.push({ ...drawing, id: crypto.randomUUID() }); known.add(canonical({ ...drawing, id: '' }));
  }
  return JSON.stringify(drawings);
}
/** Apply only this editor's changes to the latest tab snapshot; retain unrelated remote additions. */
export function rebaseDrawings(base: string, next: string, remote: string): string {
  const before = new Map(parseDrawings(base).map(d => [d.id, d]));
  const after = new Map(parseDrawings(next).map(d => [d.id, d]));
  const result = new Map(parseDrawings(remote).map(d => [d.id, d]));
  for (const [id, old] of before) {
    if (!after.has(id)) result.delete(id);
    else if (canonical(old) !== canonical(after.get(id))) result.set(id, after.get(id)!);
  }
  for (const [id, drawing] of after) if (!before.has(id)) {
    const existing = result.get(id);
    if (existing && canonical(existing) !== canonical(drawing)) { const newId = crypto.randomUUID(); result.set(newId, { ...drawing, id: newId }); }
    else result.set(id, drawing);
  }
  return JSON.stringify([...result.values()]);
}
