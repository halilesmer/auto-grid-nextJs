'use client';

import type { ComponentProps } from 'react';
import type { ScanHit } from '@/lib/formation/scan';
import { FormationAlarmMenu } from './FormationAlarmMenu';
import { FormationAsOf, FormationAsOfSteps } from './FormationAsOf';
import { FormationShotMenu } from './FormationShotMenu';
import { FormationStatusChip } from './FormationStatusChip';

/**
 * Aktionen der Formation in Zeile 1: Stand in der Vergangenheit samt Schritten, Bild, Alarm und Statuschip.
 * Mit `enabled` false (Zeiteinheit ohne Formationssuche) sind Stand und Bild aus und ihr Hinweis nennt `disabledHint`; der Alarm bleibt offen.
 */
export function FormationActions({
  enabled = true,
  disabledHint,
  showAsOf,
  pastAt,
  tfSec,
  now,
  onAsOf,
  shotReady,
  makeShotImage,
  shotFileName,
  symbol,
  alarm,
  hit,
  conditionsOpen,
  onToggleConditions,
}: ({ enabled?: true; disabledHint?: string } | { enabled: false; /** Hinweis der abgeschalteten Knöpfe: nennt den Grund */ disabledHint: string }) & {
  /** Stand und Schritte nur mit bekanntem Konto */
  showAsOf: boolean;
  pastAt: number | null;
  tfSec: number;
  now: () => number;
  onAsOf: (value: string | null) => void;
  shotReady: boolean;
  makeShotImage: () => Promise<Blob>;
  shotFileName: string;
  /** Symbol des Alarms (null: kein Alarm möglich) */
  symbol: string | null;
  alarm: ComponentProps<typeof FormationAlarmMenu>['alarm'];
  hit: ScanHit | null;
  conditionsOpen: boolean;
  onToggleConditions: () => void;
}) {
  const off = enabled ? undefined : disabledHint;
  return (
    <>
      {showAsOf && <FormationAsOfSteps pastAt={pastAt} tfSec={tfSec} now={now} onChange={onAsOf} />}
      {showAsOf && <FormationAsOf pastAt={pastAt} now={now} onChange={onAsOf} disabledHint={off} />}
      <FormationShotMenu ready={shotReady} makeImage={makeShotImage} fileName={shotFileName} disabledHint={off} />
      <FormationAlarmMenu symbol={symbol} alarm={alarm} pastView={pastAt !== null} />
      <FormationStatusChip hit={hit} open={conditionsOpen} onToggle={onToggleConditions} />
    </>
  );
}
