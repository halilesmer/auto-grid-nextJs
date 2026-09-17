'use client';

import { useState } from 'react';
import {
  useBotStore,
  type ZoneSettings,
  type SymbolDetail,
} from '@/store/useBotStore';
import { MoreVertical, Plus, Trash2, AlertTriangle, Save, Play, Pause } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import Link from 'next/link';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';

import { useSymbolDetails } from '@/hooks/useSymbolDetails';
import { useZoneDirtyTracking } from '@/hooks/useZoneDirtyTracking';
import { useZoneActions } from '@/hooks/useZoneActions';
import { useZoneFieldHandlers } from '@/hooks/useZoneFieldHandlers';
import { getSymbolConfig } from '@/utils/zoneHelpers';

interface ZoneSettingsPanelProps {
  selectedAccount: string | null;
  isRunning: boolean;
  liveData: ReturnType<typeof useBotStore.getState>['liveData'];
  isGlobalDirty?: boolean;
}

function InputField({ label, children, error }: { label: string; children: React.ReactNode; error?: React.ReactNode }) {
  return (
    <label className="flex flex-col space-y-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
      {error}
    </label>
  );
}

function ZoneHeader({
  zone,
  isActive,
  isGlobalRunning,
  modified,
  disableButtons,
  onToggleActive,
  onDelete,
}: {
  zone: ZoneSettings;
  isActive: boolean;
  isGlobalRunning: boolean;
  modified: boolean;
  disableButtons: boolean;
  onToggleActive: (zoneId: string, currentActive: boolean) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  let btnClass = '';
  let btnText = '';
  let btnIcon = <Play size={14} />;

  if (isGlobalRunning) {
    if (isActive) {
      btnClass = 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95';
      btnText = 'Başladı';
      btnIcon = <Pause size={14} />;
    } else {
      btnClass = 'bg-amber-600 hover:bg-amber-500 text-white active:scale-95';
      btnText = 'Başla';
      btnIcon = <Play size={14} />;
    }
  } else {
    if (isActive) {
      btnClass = 'bg-yellow-600 text-yellow-50 hover:bg-yellow-500 active:scale-95';
      btnText = 'Hazır (Motor Bekleniyor)';
      btnIcon = <Pause size={14} />;
    } else {
      btnClass = 'bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95';
      btnText = 'Kapalı (Motoru Başlat)';
      btnIcon = <Play size={14} />;
    }
  }

  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onToggleActive(zone.id, isActive)}
          className={`flex items-center space-x-1 text-xs font-bold px-4 py-1.5 rounded-lg transition-all shadow-md ${btnClass}`}
          title="Bölge İşlemlerini Yönet"
        >
          {btnIcon}
          <span>{btnText}</span>
        </button>
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
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
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
  );
}

function ZoneBasicFields({
  zone,
  update,
  symbolConfig,
  symbolDetails,
  handleChange,
  handleBlur,
  validateSymbol,
}: {
  zone: ZoneSettings;
  update: (field: string, value: unknown) => void;
  symbolConfig: ReturnType<typeof getSymbolConfig>;
  symbolDetails: Record<string, SymbolDetail>;
  handleChange: (field: string, value: string | number | boolean, zone: ZoneSettings, symbolConfig: ReturnType<typeof getSymbolConfig>, update: (field: string, value: unknown) => void) => void;
  handleBlur: (field: string, value: number | undefined, step: number, precision: number, update: (field: string, value: unknown) => void) => void;
  validateSymbol: (symbol: string) => boolean;
}) {
  const hasError = Object.keys(symbolDetails).length > 0 && Boolean(zone.symbol) && !validateSymbol(zone.symbol);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField label="Sembol" error={hasError && <span className="text-[11px] text-red-400 font-bold mt-1">Geçersiz Sembol!</span>}>
        <SymbolAutoComplete
          value={zone.symbol}
          onChange={(val) => handleChange('symbol', val, zone, symbolConfig, update)}
          symbolDetails={symbolDetails}
          hasError={hasError}
        />
      </InputField>
      <InputField label="Emir Tipi">
        <select
          value={zone.order_type}
          onChange={(e) => update('order_type', e.target.value)}
          className="input-s"
        >
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="BOTH">BOTH</option>
        </select>
      </InputField>
      <InputField label="Min Fiyat ($)">
        <input
          type="number"
          min={0}
          step={symbolConfig.step}
          value={zone.min_price}
          onChange={(e) => handleChange('min_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('min_price', zone.min_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField label="Max Fiyat ($)">
        <input
          type="number"
          min={0}
          step={symbolConfig.step}
          value={zone.max_price}
          onChange={(e) => handleChange('max_price', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('max_price', zone.max_price, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
    </div>
  );
}

function ZoneGridFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: {
  zone: ZoneSettings;
  update: (field: string, value: unknown) => void;
  symbolConfig: ReturnType<typeof getSymbolConfig>;
  isBoth: boolean;
  sync: boolean;
  handleChange: (field: string, value: string | number | boolean, zone: ZoneSettings, symbolConfig: ReturnType<typeof getSymbolConfig>, update: (field: string, value: unknown) => void) => void;
  handleBlur: (field: string, value: number | undefined, step: number, precision: number, update: (field: string, value: unknown) => void) => void;
}) {
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <InputField
        label={
          isBoth && sync
            ? 'Grid Adımı ($)'
            : isBoth
            ? 'BUY Grid ($)'
            : 'Grid Adımı ($)'
        }
      >
        <input
          type="number"
          min={symbolConfig.min}
          step={symbolConfig.step}
          value={zone.grid_step}
          onChange={(e) => handleChange('grid_step', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('grid_step', zone.grid_step, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={
          isBoth && sync ? 'Lot' : isBoth ? 'BUY Lot' : 'Lot'
        }
      >
        <input
          type="number"
          min={symbolConfig.volMin}
          step={symbolConfig.volStep}
          value={zone.lot_size}
          onChange={(e) => handleChange('lot_size', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('lot_size', zone.lot_size, symbolConfig.volStep, volPrecision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={
          isBoth && sync
            ? 'Kar Al ($)'
            : isBoth
            ? 'BUY KA ($)'
            : 'Kar Al ($)'
        }
      >
        <input
          type="number"
          min={0}
          step={symbolConfig.step}
          value={zone.take_profit}
          onChange={(e) => handleChange('take_profit', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('take_profit', zone.take_profit, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
      <InputField
        label={
          isBoth && sync
            ? 'Zarar Durdur ($)'
            : isBoth
            ? 'BUY ZD ($)'
            : 'Zarar Durdur ($)'
        }
      >
        <input
          type="number"
          min={0}
          step={symbolConfig.step}
          value={zone.stop_loss}
          onChange={(e) => handleChange('stop_loss', e.target.value, zone, symbolConfig, update)}
          onBlur={() => handleBlur('stop_loss', zone.stop_loss, symbolConfig.step, symbolConfig.precision, update)}
          className="input-s"
        />
      </InputField>
    </div>
  );
}

function ZoneSellFields({
  zone,
  update,
  symbolConfig,
  handleChange,
  handleBlur,
}: {
  zone: ZoneSettings;
  update: (field: string, value: unknown) => void;
  symbolConfig: ReturnType<typeof getSymbolConfig>;
  handleChange: (field: string, value: string | number | boolean, zone: ZoneSettings, symbolConfig: ReturnType<typeof getSymbolConfig>, update: (field: string, value: unknown) => void) => void;
  handleBlur: (field: string, value: number | undefined, step: number, precision: number, update: (field: string, value: unknown) => void) => void;
}) {
  const volPrecision = symbolConfig.volStep.toString().includes('.')
    ? symbolConfig.volStep.toString().split('.')[1].length
    : 2;

  return (
    <>
      <p className="text-sm text-red-400 font-semibold">SELL Grid Ayarları</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputField label="SELL Grid ($)">
          <input
            type="number"
            min={symbolConfig.min}
            step={symbolConfig.step}
            value={zone.sell_grid_step}
            onChange={(e) => handleChange('sell_grid_step', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_grid_step', zone.sell_grid_step, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL Lot">
          <input
            type="number"
            min={symbolConfig.volMin}
            step={symbolConfig.volStep}
            value={zone.sell_lot_size}
            onChange={(e) => handleChange('sell_lot_size', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_lot_size', zone.sell_lot_size, symbolConfig.volStep, volPrecision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL KA ($)">
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.sell_take_profit}
            onChange={(e) => handleChange('sell_take_profit', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_take_profit', zone.sell_take_profit, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
        <InputField label="SELL ZD ($)">
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.sell_stop_loss}
            onChange={(e) => handleChange('sell_stop_loss', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('sell_stop_loss', zone.sell_stop_loss, symbolConfig.step, symbolConfig.precision, update)}
            className="input-s"
          />
        </InputField>
      </div>
    </>
  );
}

function ZoneBreakoutFields({
  zone,
  update,
  symbolConfig,
  isBoth,
  sync,
  handleChange,
  handleBlur,
}: {
  zone: ZoneSettings;
  update: (field: string, value: unknown) => void;
  symbolConfig: ReturnType<typeof getSymbolConfig>;
  isBoth: boolean;
  sync: boolean;
  handleChange: (field: string, value: string | number | boolean, zone: ZoneSettings, symbolConfig: ReturnType<typeof getSymbolConfig>, update: (field: string, value: unknown) => void) => void;
  handleBlur: (field: string, value: number | undefined, step: number, precision: number, update: (field: string, value: unknown) => void) => void;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
        Kırılım ve Pullback Seviyeleri
      </p>
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
            {isBoth && !sync ? 'BUY Pullback ($)' : 'Min Pullback ($)'}
          </span>
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.pullback_distance}
            onChange={(e) => handleChange('pullback_distance', e.target.value, zone, symbolConfig, update)}
            onBlur={() => handleBlur('pullback_distance', zone.pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
            disabled={!zone.is_breakout}
            className="input-s w-24"
          />
        </div>
        {isBoth && !sync && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">SELL Pullback ($)</span>
            <input
              type="number"
              min={0}
              step={symbolConfig.step}
              value={zone.sell_pullback_distance}
              onChange={(e) => handleChange('sell_pullback_distance', e.target.value, zone, symbolConfig, update)}
              onBlur={() => handleBlur('sell_pullback_distance', zone.sell_pullback_distance, symbolConfig.step, symbolConfig.precision, update)}
              disabled={!zone.is_breakout}
              className="input-s w-24"
            />
          </div>
        )}
      </div>
      <hr className="border-white/5" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InputField label="Alt Seviyeler">
          <input
            type="number"
            min={1}
            step={1}
            value={zone.levels_below}
            onChange={(e) => update('levels_below', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'BUY'}
            className="input-s"
          />
        </InputField>
        <InputField label="Üst Seviyeler">
          <input
            type="number"
            min={1}
            step={1}
            value={zone.levels_above}
            onChange={(e) => update('levels_above', parseInt(e.target.value, 10) || 1)}
            disabled={zone.is_breakout && zone.order_type === 'SELL'}
            className="input-s"
          />
        </InputField>
        <InputField label="Maks Pozisyon">
          <input
            type="number"
            min={0}
            step={1}
            value={zone.max_positions}
            onChange={(e) => update('max_positions', parseInt(e.target.value, 10) || 0)}
            className="input-s"
          />
        </InputField>
      </div>
    </div>
  );
}

function ZoneExitFields({
  zone,
  update,
}: {
  zone: ZoneSettings;
  update: (field: string, value: unknown) => void;
}) {
  return (
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
            <InputField label="Çıkış Yönü">
              <select
                value={zone.clear_exit_side}
                onChange={(e) => update('clear_exit_side', e.target.value)}
                className="input-s"
              >
                <option value="Farketmez">Herhangi</option>
                <option value="BUY (Yukarı)">BUY (Yukarı)</option>
                <option value="SELL (Aşağı)">SELL (Aşağı)</option>
              </select>
            </InputField>
            <InputField label="Hedef Taraf">
              <select
                value={zone.clear_target_side}
                onChange={(e) => update('clear_target_side', e.target.value)}
                className="input-s"
              >
                <option value="Farketmez (Hepsi)">Hepsi</option>
                <option value="Sadece BUY İşlemleri">Sadece BUY</option>
                <option value="Sadece SELL İşlemleri">Sadece SELL</option>
              </select>
            </InputField>
            <InputField label="Temizleme Kapsamı">
              <select
                value={zone.clear_scope}
                onChange={(e) => update('clear_scope', e.target.value)}
                className="input-s"
              >
                <option value="Sadece Bekleyen Emirler">Sadece Bekleyen Emirler</option>
                <option value="Tüm İşlemler">Tüm İşlemler</option>
              </select>
            </InputField>
            <InputField label="Çıkış Tetikleyici">
              <select
                value={zone.exit_condition}
                onChange={(e) => update('exit_condition', e.target.value)}
                className="input-s"
              >
                <option value="Anlık Fiyat">Anlık Fiyat</option>
                <option value="Mum Kapanışı">Mum Kapanışı</option>
              </select>
            </InputField>
          </div>
          {zone.exit_condition === 'Mum Kapanışı' && (
            <div className="w-48">
              <InputField label="Zaman Dilimi">
                <select
                  value={zone.exit_timeframe}
                  onChange={(e) => update('exit_timeframe', e.target.value)}
                  className="input-s"
                >
                  {['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].map((tf) => (
                    <option key={tf} value={tf}>{tf}</option>
                  ))}
                </select>
              </InputField>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ZoneCard({
  zone,
  modified,
  disableButtons,
  onUpdate,
  onToggleActive,
  onDelete,
  liveData,
  isRunning,
  symbolDetails,
  handleChange,
  handleBlur,
  validateSymbol,
}: {
  zone: ZoneSettings;
  modified: boolean;
  disableButtons: boolean;
  onUpdate: (zoneId: string, field: string, value: unknown) => void;
  onToggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  onDelete: () => void;
  liveData: ReturnType<typeof useBotStore.getState>['liveData'];
  isRunning: boolean;
  symbolDetails: Record<string, SymbolDetail>;
  handleChange: (field: string, value: string | number | boolean, zone: ZoneSettings, symbolConfig: ReturnType<typeof getSymbolConfig>, update: (field: string, value: unknown) => void) => void;
  handleBlur: (field: string, value: number | undefined, step: number, precision: number, update: (field: string, value: unknown) => void) => void;
  validateSymbol: (symbol: string) => boolean;
}) {
  const isBoth = zone.order_type === 'BOTH';
  const showBuyLabel = zone.order_type === 'BUY';
  const showSellLabel = zone.order_type === 'SELL';
  const isActive = zone.is_active !== false;
  const isGlobalRunning = liveData.mt5_connected && isRunning;
  const symbolConfig = getSymbolConfig(zone.symbol, symbolDetails);

  const update = (field: string, value: unknown) => onUpdate(zone.id, field, value);

  const handleToggleActive = () => {
    onToggleActive(zone.id, isActive);
  };

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-xl shadow-xl space-y-4">
      <ZoneHeader
        zone={zone}
        isActive={isActive}
        isGlobalRunning={isGlobalRunning}
        modified={modified}
        disableButtons={disableButtons}
        onToggleActive={handleToggleActive}
        onDelete={onDelete}
      />

      <hr className="border-white/10" />

      <ZoneBasicFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        symbolDetails={symbolDetails}
        handleChange={handleChange}
        handleBlur={handleBlur}
        validateSymbol={validateSymbol}
      />

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

      {showBuyLabel && (
        <p className="text-sm text-green-400 font-semibold">BUY (Alış) Grid Ayarları</p>
      )}
      {showSellLabel && (
        <p className="text-sm text-red-400 font-semibold">SELL (Satış) Grid Ayarları</p>
      )}

      <ZoneGridFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
      />

      {isBoth && !zone.sync_buy_sell && (
        <ZoneSellFields
          zone={zone}
          update={update}
          symbolConfig={symbolConfig}
          handleChange={handleChange}
          handleBlur={handleBlur}
        />
      )}

      <ZoneBreakoutFields
        zone={zone}
        update={update}
        symbolConfig={symbolConfig}
        isBoth={isBoth}
        sync={zone.sync_buy_sell}
        handleChange={handleChange}
        handleBlur={handleBlur}
      />

      <ZoneExitFields
        zone={zone}
        update={update}
      />
    </div>
  );
}

export default function ZoneSettingsPanel({
  selectedAccount,
  isRunning,
  liveData,
  isGlobalDirty,
}: ZoneSettingsPanelProps) {
  const { settings, setZones } = useBotStore();
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const zones = settings?.ZONES || [];

  const symbolDetails = useSymbolDetails(selectedAccount);
  const { modified } = useZoneDirtyTracking(zones, isGlobalDirty);
  const { toggleActive, addZone, deleteZone, updateZone } = useZoneActions(selectedAccount, setZones);
  const { handleChange, handleBlur, validateSymbol } = useZoneFieldHandlers(symbolDetails);

  const handleDeleteZone = (zoneId: string) => {
    setDeleteZoneId(zoneId);
  };

  const handleRemoveZoneConfirmed = () => {
    if (!deleteZoneId) return;
    deleteZone(deleteZoneId);
    setDeleteZoneId(null);
  };

  if (!selectedAccount) return null;

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;

  return (
    <div className="space-y-6">
      {(error || liveData.last_error) && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start space-x-2 shadow-lg">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div className="flex flex-col">
            {liveData.last_error && (
              <span className="font-bold text-red-300 mb-0.5">
                MT5 Terminal / Bağlantı Hatası
              </span>
            )}
            <span>{error || liveData.last_error}</span>
          </div>
          <button
            onClick={() => {
              setError('');
              if (liveData.last_error)
                useBotStore.getState().updateLiveData({ last_error: null });
            }}
            className="ml-auto text-red-400 hover:text-red-300 px-2 font-bold"
          >
            X
          </button>
        </div>
      )}

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

      {zones.map((zone) => {
        const isModified = modified(zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            modified={isModified}
            disableButtons={disableActionButtons}
            onUpdate={updateZone}
            onToggleActive={toggleActive}
            onDelete={() => handleDeleteZone(zone.id)}
            liveData={liveData}
            isRunning={isRunning}
            symbolDetails={symbolDetails}
            handleChange={handleChange}
            handleBlur={handleBlur}
            validateSymbol={validateSymbol}
          />
        );
      })}

      <ConfirmModal
        open={deleteZoneId !== null}
        onClose={() => setDeleteZoneId(null)}
        onConfirm={handleRemoveZoneConfirmed}
        title="Bölge Sil"
        message="Bu bölgeyi silmek istediğinizden emin misiniz?"
        variant="danger"
      />
    </div>
  );
}