'use client';

import { useCallback, useState } from 'react';
import { useBotStore, defaultZone, type ZoneSettings, type GlobalSettings } from '@/store/useBotStore';
import { MoreVertical, Plus, Trash2, AlertTriangle, Save } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import Link from 'next/link';

function zoneModified(original: ZoneSettings | undefined, current: ZoneSettings): boolean {
  if (!original) return true;
  return JSON.stringify(original) !== JSON.stringify(current);
}

interface ZoneSettingsPanelProps {
  selectedAccount: string | null;
  activeAccount: ReturnType<typeof useBotStore.getState>['activeAccount'];
  isRunning: boolean;
  liveData: ReturnType<typeof useBotStore.getState>['liveData'];
}

export default function ZoneSettingsPanel({
  selectedAccount,
  activeAccount,
  isRunning,
  liveData,
}: ZoneSettingsPanelProps) {
  const { settings, setZones } = useBotStore();
  const [originalZones, setOriginalZones] = useState<ZoneSettings[]>([]);
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;
  const zones = settings?.ZONES || [];

  // Orijinal zones'ları takip et (değişiklik kontrolü için)
  useState(() => {
    if (zones.length > 0 && originalZones.length === 0) {
      setOriginalZones(zones.map(z => ({ ...z })));
    }
  });

  const updateZone = useCallback((zoneId: string, field: string, value: unknown) => {
    setZones((prevZones) => prevZones.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z)));
  }, [setZones]);

  const addZone = useCallback(() => {
    setZones((prevZones) => [...prevZones, defaultZone()]);
  }, [setZones]);

  const removeZoneConfirmed = useCallback(() => {
    if (!deleteZoneId) return;
    setZones((prevZones) => {
      const filtered = prevZones.filter((z) => z.id !== deleteZoneId);
      return filtered.length > 0 ? filtered : [defaultZone()];
    });
    setDeleteZoneId(null);
  }, [deleteZoneId, setZones]);

  if (!selectedAccount) return null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center space-x-2">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-300">
            x
          </button>
        </div>
      )}

      {/* Dynamic Zones */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Dinamik Bölgeler</h3>
        <button
          onClick={addZone}
          disabled={disableActionButtons}
          className="flex items-center space-x-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>Bölge Ekle</span>
        </button>
      </div>

      {zones.map((zone, idx) => {
        const origZone = originalZones.find((z) => z.id === zone.id);
        const modified = zoneModified(origZone, zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            idx={idx}
            origZone={origZone}
            modified={modified}
            disableButtons={disableActionButtons}
            onUpdate={updateZone}
            onDelete={() => setDeleteZoneId(zone.id)}
            liveData={liveData}
            activeAccount={activeAccount}
          />
        );
      })}

      {/* Delete Zone Confirmation */}
      <ConfirmModal
        open={deleteZoneId !== null}
        onClose={() => setDeleteZoneId(null)}
        onConfirm={removeZoneConfirmed}
        title="Bölge Sil"
        message="Bu bölgeyi silmek istediğinizden emin misiniz?"
        variant="danger"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Zone Card sub-component                                              */
/* ------------------------------------------------------------------ */

interface ZoneCardProps {
  zone: ZoneSettings;
  idx: number;
  origZone: ZoneSettings | undefined;
  modified: boolean;
  disableButtons: boolean;
  onUpdate: (zoneId: string, field: string, value: unknown) => void;
  onDelete: () => void;
  liveData: ReturnType<typeof useBotStore.getState>['liveData'];
  activeAccount: ReturnType<typeof useBotStore.getState>['activeAccount'];
}

function ZoneCard({
  zone,
  idx,
  origZone,
  modified,
  disableButtons,
  onUpdate,
  onDelete,
  liveData,
  activeAccount,
}: ZoneCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const update = (field: string, value: unknown) => onUpdate(zone.id, field, value);

  const isBoth = zone.order_type === 'BOTH';
  const showBuyLabel = zone.order_type === 'BUY';
  const showSellLabel = zone.order_type === 'SELL';

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-xl shadow-xl space-y-4">
      {/* Zone Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-lg font-bold text-white">
            Bölge {idx + 1} &#8212; {zone.symbol} ({zone.order_type})
          </h4>
          <div className="text-sm text-gray-400 mt-0.5">
            <span>${liveData.current_price.toFixed(2)}</span>
            <span className="mx-2">|</span>
            <span>{activeAccount?.server || 'N/A'}</span>
            <span className="mx-2">|</span>
            <span>{liveData.market_open ? 'Açık' : 'Kapalı'}</span>
            <span className="mx-2">|</span>
            <span className={liveData.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
              K/Z: ${liveData.profit.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Link
            href={`/chart?zone=${zone.id}`}
            className="flex items-center justify-center text-xs font-bold px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-95 shadow-md"
            title="Bölgeye Özel Test ve İstatistikler"
          >
            Test
          </Link>
          {modified && (
            <span className="text-xs text-orange-400 flex items-center gap-1">
              <Save size={12} />
              Kaydedilmedi
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-white/10 rounded-lg shadow-xl py-1 z-20 w-48">
                <button
                  onClick={() => { onDelete(); setMenuOpen(false); }}
                  disabled={disableButtons}
                  className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Trash2 size={14} />
                  <span>Bölgeyi Sil</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="border-white/10" />

      {/* Row 1: Symbol, Order Type, Min, Max */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup label="Sembol">
          <input
            type="text"
            value={zone.symbol}
            onChange={(e) => update('symbol', e.target.value.toUpperCase().trim())}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label="Emir Tipi">
          <select
            value={zone.order_type}
            onChange={(e) => update('order_type', e.target.value)}
            className="input-s"
          >
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="BOTH">BOTH</option>
          </select>
        </InputGroup>
        <InputGroup label="Min Fiyat ($)">
          <input
            type="number"
            min={0}
            step={0.1}
            value={zone.min_price}
            onChange={(e) => update('min_price', parseFloat(e.target.value) || 0)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label="Max Fiyat ($)">
          <input
            type="number"
            min={0}
            step={0.1}
            value={zone.max_price}
            onChange={(e) => update('max_price', parseFloat(e.target.value) || 0)}
            className="input-s"
          />
        </InputGroup>
      </div>

      {/* Both sync checkbox */}
      {isBoth && (
        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id={`sync-${zone.id}`}
            checked={zone.sync_buy_sell}
            onChange={(e) => update('sync_buy_sell', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <label htmlFor={`sync-${zone.id}`} className="text-sm text-gray-300">
            BUY ve SELL için aynı ayarları uygula
          </label>
        </div>
      )}

      {/* Direction label */}
      {showBuyLabel && <p className="text-sm text-green-400 font-semibold">BUY (Alış) Grid Ayarları</p>}
      {showSellLabel && <p className="text-sm text-red-400 font-semibold">SELL (Satış) Grid Ayarları</p>}

      {/* Row 2: Grid, Lot, TP, SL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Grid Adımı ($)' : isBoth ? 'BUY Grid ($)' : 'Grid Adımı ($)'}>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={zone.grid_step}
            onChange={(e) => update('grid_step', parseFloat(e.target.value) || 0.01)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Lot' : isBoth ? 'BUY Lot' : 'Lot'}>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={zone.lot_size}
            onChange={(e) => update('lot_size', parseFloat(e.target.value) || 0.01)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Kar Al ($)' : isBoth ? 'BUY KA ($)' : 'Kar Al ($)'}>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={zone.take_profit}
            onChange={(e) => update('take_profit', parseFloat(e.target.value) || 0.01)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Zarar Durdur ($)' : isBoth ? 'BUY ZD ($)' : 'Zarar Durdur ($)'}>
          <input
            type="number"
            min={0}
            step={0.01}
            value={zone.stop_loss}
            onChange={(e) => update('stop_loss', parseFloat(e.target.value) || 0)}
            className="input-s"
          />
        </InputGroup>
      </div>

      {/* SELL fields when BOTH and not synced */}
      {isBoth && !zone.sync_buy_sell && (
        <>
          <p className="text-sm text-red-400 font-semibold">SELL Grid Ayarları</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InputGroup label="SELL Grid ($)">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={zone.sell_grid_step}
                onChange={(e) => update('sell_grid_step', parseFloat(e.target.value) || 0.01)}
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL Lot">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={zone.sell_lot_size}
                onChange={(e) => update('sell_lot_size', parseFloat(e.target.value) || 0.01)}
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL KA ($)">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={zone.sell_take_profit}
                onChange={(e) => update('sell_take_profit', parseFloat(e.target.value) || 0.01)}
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL ZD ($)">
              <input
                type="number"
                min={0}
                step={0.01}
                value={zone.sell_stop_loss}
                onChange={(e) => update('sell_stop_loss', parseFloat(e.target.value) || 0)}
                className="input-s"
              />
            </InputGroup>
          </div>
        </>
      )}

      {/* Breakout & Pullback */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Kırılım ve Pullback Seviyeleri</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={zone.is_breakout}
              onChange={(e) => update('is_breakout', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <span>Sadece trend yönünde</span>
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {isBoth && !zone.sync_buy_sell ? 'BUY Pullback ($)' : 'Min Pullback ($)'}
            </span>
            <input
              type="number"
              min={0.01}
              step={0.05}
              value={zone.pullback_distance}
              onChange={(e) => update('pullback_distance', parseFloat(e.target.value) || 0.01)}
              disabled={!zone.is_breakout}
              className="input-s w-24"
            />
          </div>
          {isBoth && !zone.sync_buy_sell && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-400 whitespace-nowrap">SELL Pullback ($)</span>
              <input
                type="number"
                min={0.01}
                step={0.05}
                value={zone.sell_pullback_distance}
                onChange={(e) => update('sell_pullback_distance', parseFloat(e.target.value) || 0.01)}
                disabled={!zone.is_breakout}
                className="input-s w-24"
              />
            </div>
          )}
        </div>
        <hr className="border-white/5" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InputGroup label="Alt Seviyeler">
            <input
              type="number"
              min={1}
              step={1}
              value={zone.levels_below}
              onChange={(e) => update('levels_below', parseInt(e.target.value, 10) || 1)}
              disabled={zone.is_breakout && showBuyLabel}
              className="input-s"
            />
          </InputGroup>
          <InputGroup label="Üst Seviyeler">
            <input
              type="number"
              min={1}
              step={1}
              value={zone.levels_above}
              onChange={(e) => update('levels_above', parseInt(e.target.value, 10) || 1)}
              disabled={zone.is_breakout && showSellLabel}
              className="input-s"
            />
          </InputGroup>
          <InputGroup label="Maks Pozisyon">
            <input
              type="number"
              min={0}
              step={1}
              value={zone.max_positions}
              onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
              className="input-s"
            />
          </InputGroup>
        </div>
      </div>

      {/* Clear on Exit */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={zone.clear_on_exit}
            onChange={(e) => update('clear_on_exit', e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <span>Fiyat bölgeden çıkınca temizle</span>
        </label>
        {zone.clear_on_exit && (
          <>
            <hr className="border-white/5" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <InputGroup label="Çıkış Yönü">
                <select
                  value={zone.clear_exit_side}
                  onChange={(e) => update('clear_exit_side', e.target.value)}
                  className="input-s"
                >
                  <option value="Farketmez">Herhangi</option>
                  <option value="BUY (Yukarı)">BUY (Yukarı)</option>
                  <option value="SELL (Aşağı)">SELL (Aşağı)</option>
                </select>
              </InputGroup>
              <InputGroup label="Hedef Taraf">
                <select
                  value={zone.clear_target_side}
                  onChange={(e) => update('clear_target_side', e.target.value)}
                  className="input-s"
                >
                  <option value="Farketmez (Hepsi)">Hepsi</option>
                  <option value="Sadece BUY İşlemleri">Sadece BUY</option>
                  <option value="Sadece SELL İşlemleri">Sadece SELL</option>
                </select>
              </InputGroup>
              <InputGroup label="Temizleme Kapsamı">
                <select
                  value={zone.clear_scope}
                  onChange={(e) => update('clear_scope', e.target.value)}
                  className="input-s"
                >
                  <option value="Sadece Bekleyen Emirler">Sadece Bekleyen Emirler</option>
                  <option value="Tüm İşlemler">Tüm İşlemler</option>
                </select>
              </InputGroup>
              <InputGroup label="Çıkış Tetikleyici">
                <select
                  value={zone.exit_condition}
                  onChange={(e) => update('exit_condition', e.target.value)}
                  className="input-s"
                >
                  <option value="Anlık Fiyat">Anlık Fiyat</option>
                  <option value="Mum Kapanışı">Mum Kapanışı</option>
                </select>
              </InputGroup>
            </div>
            {zone.exit_condition === 'Mum Kapanışı' && (
              <div className="w-48">
                <InputGroup label="Zaman Dilimi">
                  <select
                    value={zone.exit_timeframe}
                    onChange={(e) => update('exit_timeframe', e.target.value)}
                    className="input-s"
                  >
                    {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                      <option key={tf} value={tf}>{tf}</option>
                    ))}
                  </select>
                </InputGroup>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tiny input group helper                                              */
/* ------------------------------------------------------------------ */

function InputGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col space-y-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </label>
  );
}