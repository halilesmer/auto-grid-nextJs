/**
 * Grid-Stufen (gewünscht und zulässig). Quelle: worker_python/src/core/grid_execution/levels.py.
 * src/lib/analysis/levels.ts rechnet für den Chart nur die gewünschten Stufen; die Engine braucht
 * zusätzlich die zulässigen Stufen (Order-Prüfung), deshalb hier der vollständige Port.
 */
import type { ZoneConfig } from './config';
import { normalizePrice, type SymbolInfos } from './gridHelpers';
import { MT5, type Position } from './mt5';
import { pyRound } from './pyRound';

export interface LevelSets {
  desiredBuy: number[];
  desiredSell: number[];
  acceptableBuy: number[];
  acceptableSell: number[];
}

/** „Abstand nach Verlust“ / „Sofort-Einstieg“: Stufen ab der letzten Position der Seite */
export function isPositionAnchored(config: ZoneConfig): boolean {
  return config.stepByLoss || config.instantEntry;
}

function anchor(config: ZoneConfig, price: number, positions: Position[], posType: number, step: number): number {
  if (isPositionAnchored(config)) {
    const side = positions.filter((p) => p.magic === config.targetMagic && p.type === posType);
    if (side.length) {
      let last = side[0];
      for (const p of side.slice(1)) {
        const a = p.time_msc || 0;
        const b = last.time_msc || 0;
        if (a > b || (a === b && p.ticket > last.ticket)) last = p;
      }
      return last.price_open + pyRound((price - last.price_open) / step) * step;
    }
  }
  return pyRound(price / step) * step;
}

export function generateLevels(
  config: ZoneConfig,
  currentAvgPrice: number,
  robotPositions: Position[],
  symbolInfos: SymbolInfos,
): LevelSets {
  const buyAnchor = anchor(config, currentAvgPrice, robotPositions, MT5.POSITION_TYPE_BUY, config.gridStep);
  const sellAnchor = anchor(config, currentAvgPrice, robotPositions, MT5.POSITION_TYPE_SELL, config.sellGridStep);
  const norm = (p: number) => normalizePrice(p, config.symbol, symbolInfos);

  const desiredBuy: number[] = [];
  const desiredSell: number[] = [];
  const acceptableBuy: number[] = [];
  const acceptableSell: number[] = [];
  const bufferSteps = 2;
  const zMin = pyRound(config.minPrice, 5);
  const zMax = pyRound(config.maxPrice, 5);
  const inZone = (p: number) => zMin <= pyRound(p, 5) && pyRound(p, 5) <= zMax;

  for (const pos of robotPositions) {
    if (pos.magic !== config.targetMagic) continue;
    if (pos.type === MT5.POSITION_TYPE_BUY) acceptableBuy.push(norm(pos.price_open));
    else if (pos.type === MT5.POSITION_TYPE_SELL) acceptableSell.push(norm(pos.price_open));
  }

  if (config.orderType === 'BUY' || config.orderType === 'BOTH') {
    if (!config.isBreakout) {
      for (let i = 1; i <= config.levelsBelow; i++) {
        const p = buyAnchor - i * config.gridStep;
        if (inZone(p)) desiredBuy.push(norm(p));
      }
    }
    for (let i = 1; i <= config.levelsAbove; i++) {
      const p = buyAnchor + i * config.gridStep;
      if (config.isBreakout && pyRound(p - currentAvgPrice, 5) < pyRound(config.pullbackDistance, 5)) continue;
      if (inZone(p)) desiredBuy.push(norm(p));
    }
    for (let i = -config.levelsBelow - bufferSteps; i < config.levelsAbove + bufferSteps + 1; i++) {
      const levelP = buyAnchor + i * config.gridStep;
      if (config.isBreakout && levelP < currentAvgPrice) continue;
      acceptableBuy.push(norm(levelP));
    }
  }

  if (config.orderType === 'SELL' || config.orderType === 'BOTH') {
    if (!config.isBreakout) {
      for (let i = 1; i <= config.levelsAbove; i++) {
        const p = sellAnchor + i * config.sellGridStep;
        if (inZone(p)) desiredSell.push(norm(p));
      }
    }
    for (let i = 1; i <= config.levelsBelow; i++) {
      const p = sellAnchor - i * config.sellGridStep;
      if (config.isBreakout && pyRound(currentAvgPrice - p, 5) < pyRound(config.sellPullbackDistance, 5)) continue;
      if (inZone(p)) desiredSell.push(norm(p));
    }
    for (let i = -config.levelsBelow - bufferSteps; i < config.levelsAbove + bufferSteps + 1; i++) {
      const levelP = sellAnchor + i * config.sellGridStep;
      if (config.isBreakout && levelP > currentAvgPrice) continue;
      acceptableSell.push(norm(levelP));
    }
  }

  return { desiredBuy, desiredSell, acceptableBuy, acceptableSell };
}
