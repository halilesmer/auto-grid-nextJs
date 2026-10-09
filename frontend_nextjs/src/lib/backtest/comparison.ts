import type { CurvePoint } from '@/lib/analysis/curves';
import type { RunResult } from './runner';
import type { RunContext } from './setupTypes';

export interface ComparisonRun {
  id: string;
  setupId: string;
  label: string;
  color: string;
  result: RunResult;
  context: RunContext;
}

/** Alternative Kerzenwege desselben Setups sind keine zwei Portfolio-Bestandteile. */
export function aggregateBlock(rows: ComparisonRun[]): 'count' | 'currency' | 'period' | 'paths' | null {
  if (rows.length < 2) return 'count';
  if (!rows[0].context.currency || rows.some((r) => r.context.currency !== rows[0].context.currency)) return 'currency';
  const { from, to } = rows[0].context.params;
  if (rows.some((r) => r.context.params.from !== from || r.context.params.to !== to)) return 'period';
  if (new Set(rows.map((r) => r.setupId)).size !== rows.length) return 'paths';
  return null;
}

/** Summe der Kapitalbeträge; letzter bekannter Wert je Kurve, niemals ein zukünftiger Wert. */
export function aggregateEquity(rows: ComparisonRun[]): CurvePoint[] {
  if (aggregateBlock(rows)) return [];
  const { from, to } = rows[0].context.params;
  const times = [...new Set([from, to, ...rows.flatMap((r) => r.result.equity.map((p) => p.time))])]
    .filter((time) => time >= from && time <= to).sort((a, b) => a - b);
  const indices = rows.map(() => 0);
  const values = rows.map((r) => r.result.summary.startCapital);
  return times.map((time) => {
    rows.forEach((row, i) => {
      const points = row.result.equity;
      while (indices[i] < points.length && points[indices[i]].time <= time) values[i] = points[indices[i]++].value;
    });
    return { time, value: values.reduce((a, b) => a + b, 0) };
  });
}
