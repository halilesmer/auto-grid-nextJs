/** ENG-31: dieselbe Eingabegrenze wie validate_spread_guard im Worker. */
export interface SpreadGuardSettings {
  enabled: boolean;
  mode: 'fixed' | 'relative' | 'grid';
  max_spread?: number;
  multiplier?: number;
  grid_percent?: number;
  bootstrap?: 'wait' | 'manual';
  initial_spread?: number;
}

export type SpreadGuardReason = 'ready' | 'learning' | 'high' | 'recovering' | 'invalid_tick' | 'invalid_settings';
export interface SpreadGuardStatus {
  blocked: boolean;
  reason: SpreadGuardReason;
  spread: number | null;
  limit: number | null;
  samples: number;
  reference: number | null;
  recovery_seconds: number;
  updated_at: number;
}

export function spreadGuardError(zone: { readonly [key: string]: unknown }): string | null {
  const raw = zone.spread_guard;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return 'spread_guard: enabled must be boolean';
  const cfg = raw as Record<string, unknown>;
  if (cfg.enabled !== undefined && typeof cfg.enabled !== 'boolean') return 'spread_guard: enabled must be boolean';
  if (!cfg.enabled) return null;
  if (!['fixed', 'relative', 'grid'].includes(String(cfg.mode))) return 'spread_guard: invalid mode';
  if (cfg.mode === 'grid' && zone.entry_mode === 'fractal') return 'spread_guard: grid mode requires grid entry';
  const fieldByMode: Record<string, string> = { fixed: 'max_spread', relative: 'multiplier', grid: 'grid_percent' };
  const fields = [fieldByMode[String(cfg.mode)]];
  if (cfg.mode === 'relative') {
    if (cfg.bootstrap !== 'wait' && cfg.bootstrap !== 'manual') return 'spread_guard: invalid bootstrap';
    if (cfg.bootstrap === 'manual') fields.push('initial_spread');
  }
  for (const field of fields) {
    const v = cfg[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return `spread_guard: ${field} must be positive and finite`;
  }
  return null;
}
