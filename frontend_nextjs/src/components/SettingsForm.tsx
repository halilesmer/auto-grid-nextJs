'use client';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useBotStore, defaultZone, type ZoneSettings, type GlobalSettings } from '@/store/useBotStore';
import { MoreVertical, Plus, Trash2, Save, AlertTriangle } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';

const rawAPI =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://tweet-overlying-monotone.ngrok-free.dev";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

function deepCloneSettings(s: GlobalSettings): GlobalSettings {
  return JSON.parse(JSON.stringify(s));
}

function zoneModified(original: ZoneSettings | undefined, current: ZoneSettings): boolean {
  if (!original) return true;
  return JSON.stringify(original) !== JSON.stringify(current);
}

export default function SettingsForm() {
  const {
    selectedAccount,
    activeAccount,
    setSettings: setZustandSettings,
    isRunning,
    liveData,
  } = useBotStore();

  const [localSettings, setLocalSettings] = useState<GlobalSettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<GlobalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedAccount) {
      setLocalSettings(null);
      setOriginalSettings(null);
      return;
    }
    axios
      .get(`${API}/settings/${selectedAccount}`)
      .then((res) => {
        const data: Record<string, unknown> = res.data?.settings || {};
        const zones: ZoneSettings[] = (data.ZONES as ZoneSettings[] | undefined) || [];
        if (zones.length === 0) {
          zones.push(defaultZone());
        }
        const gs: GlobalSettings = {
          ORDER_TYPE: (data.ORDER_TYPE as string) || zones[0]?.order_type || 'BUY',
          SYMBOL: (data.SYMBOL as string) || zones[0]?.symbol || 'USOUSD',
          LOOP_INTERVAL_SECONDS: (data.LOOP_INTERVAL_SECONDS as number) || 1.0,
          ZONES: zones,
        };
        setLocalSettings(deepCloneSettings(gs));
        setOriginalSettings(deepCloneSettings(gs));
        setZustandSettings(gs);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        const d = defaultZone();
        const gs: GlobalSettings = {
          ORDER_TYPE: d.order_type,
          SYMBOL: d.symbol,
          LOOP_INTERVAL_SECONDS: 1.0,
          ZONES: [d],
        };
        setLocalSettings(deepCloneSettings(gs));
        setOriginalSettings(deepCloneSettings(gs));
        setZustandSettings(gs);
      });
  }, [selectedAccount, setZustandSettings]);

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;

  const updateZone = useCallback((zoneId: string, field: string, value: unknown) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ZONES: prev.ZONES.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z)),
      };
    });
  }, []);

  const updateGlobal = useCallback((field: string, value: unknown) => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, [field]: value };
    });
  }, []);

  const addZone = useCallback(() => {
    setLocalSettings((prev) => {
      if (!prev) return prev;
      return { ...prev, ZONES: [...prev.ZONES, defaultZone()] };
    });
  }, []);

  const removeZoneConfirmed = useCallback(() => {
    if (!deleteZoneId) return;
    setLocalSettings((prev) => {
      if (!prev) return prev;
      const zones = prev.ZONES.filter((z) => z.id !== deleteZoneId);
      return { ...prev, ZONES: zones.length > 0 ? zones : [defaultZone()] };
    });
    setDeleteZoneId(null);
  }, [deleteZoneId]);

  const handleSave = useCallback(async () => {
    if (!selectedAccount || !localSettings) return;
    setSaving(true);
    setError('');
    try {
      await axios.post(`${API}/settings/${selectedAccount}`, { settings: localSettings });
      const clone = deepCloneSettings(localSettings);
      setOriginalSettings(clone);
      setZustandSettings(clone);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [selectedAccount, localSettings, setZustandSettings]);

  if (!selectedAccount || !localSettings) return null;

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

      {/* Loop Interval */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 p-4 rounded-xl flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">Global Settings</h3>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-400 whitespace-nowrap">Loop Interval (s):</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={localSettings.LOOP_INTERVAL_SECONDS}
            onChange={(e) =>
              updateGlobal('LOOP_INTERVAL_SECONDS', parseFloat(e.target.value) || 1.0)
            }
            className="w-20 bg-black/40 border border-white/20 rounded-lg px-2 py-1 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Dynamic Zones */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white">Dynamic Zones</h3>
        <button
          onClick={addZone}
          disabled={disableActionButtons}
          className="flex items-center space-x-1 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>Add Zone</span>
        </button>
      </div>

      {localSettings.ZONES.map((zone, idx) => {
        const origZone = originalSettings?.ZONES?.find((z) => z.id === zone.id);
        const modified = zoneModified(origZone, zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            idx={idx}
            origZone={origZone}
            modified={modified}
            disableButtons={disableActionButtons}
            saving={saving}
            onUpdate={updateZone}
            onDelete={() => setDeleteZoneId(zone.id)}
            onSave={handleSave}
            liveData={liveData}
            activeAccount={activeAccount}
          />
        );
      })}

      {/* Save all button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save size={18} />
          <span>{saving ? 'Saving...' : 'Save All Settings'}</span>
        </button>
      </div>

      {/* Delete Zone Confirmation */}
      <ConfirmModal
        open={deleteZoneId !== null}
        onClose={() => setDeleteZoneId(null)}
        onConfirm={removeZoneConfirmed}
        title="Delete Zone"
        message="Are you sure you want to delete this zone?"
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
  saving: boolean;
  onUpdate: (zoneId: string, field: string, value: unknown) => void;
  onDelete: () => void;
  onSave: () => void;
  liveData: ReturnType<typeof useBotStore.getState>['liveData'];
  activeAccount: ReturnType<typeof useBotStore.getState>['activeAccount'];
}

function ZoneCard({ zone, idx, origZone, modified, disableButtons, saving, onUpdate, onDelete, onSave, liveData, activeAccount }: ZoneCardProps) {
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
            Zone {idx + 1} &#8212; {zone.symbol} ({zone.order_type})
          </h4>
          <div className="text-sm text-gray-400 mt-0.5">
            <span>${liveData.current_price.toFixed(2)}</span>
            <span className="mx-2">|</span>
            <span>{activeAccount?.server || 'N/A'}</span>
            <span className="mx-2">|</span>
            <span>{liveData.market_open ? 'Open' : 'Closed'}</span>
            <span className="mx-2">|</span>
            <span className={liveData.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
              P/L: ${liveData.profit.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onSave}
            disabled={saving || disableButtons}
            className={`flex items-center space-x-1 text-sm font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
              modified
                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                : 'bg-white/10 hover:bg-white/20 text-gray-300'
            }`}
            title={modified ? 'Unsaved changes!' : 'Update'}
          >
            <Save size={14} />
            <span>{modified ? 'Update' : 'Update'}</span>
          </button>
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
                  <span>Delete Zone</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <hr className="border-white/10" />

      {/* Row 1: Symbol, Order Type, Min, Max */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup label="Symbol">
          <input
            type="text"
            value={zone.symbol}
            onChange={(e) => update('symbol', e.target.value.toUpperCase().trim())}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label="Order Type">
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
        <InputGroup label="Min Price ($)">
          <input
            type="number"
            min={0}
            step={0.1}
            value={zone.min_price}
            onChange={(e) => update('min_price', parseFloat(e.target.value) || 0)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label="Max Price ($)">
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
            Apply same settings to BUY and SELL
          </label>
        </div>
      )}

      {/* Direction label */}
      {showBuyLabel && <p className="text-sm text-green-400 font-semibold">BUY (Buy) Grid Settings</p>}
      {showSellLabel && <p className="text-sm text-red-400 font-semibold">SELL (Sell) Grid Settings</p>}

      {/* Row 2: Grid, Lot, TP, SL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Grid Step ($)' : isBoth ? 'BUY Grid ($)' : 'Grid Step ($)'}>
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
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Take Profit ($)' : isBoth ? 'BUY TP ($)' : 'Take Profit ($)'}>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={zone.take_profit}
            onChange={(e) => update('take_profit', parseFloat(e.target.value) || 0.01)}
            className="input-s"
          />
        </InputGroup>
        <InputGroup label={isBoth && zone.sync_buy_sell ? 'Stop Loss ($)' : isBoth ? 'BUY SL ($)' : 'Stop Loss ($)'}>
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
          <p className="text-sm text-red-400 font-semibold">SELL Grid Settings</p>
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
            <InputGroup label="SELL TP ($)">
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={zone.sell_take_profit}
                onChange={(e) => update('sell_take_profit', parseFloat(e.target.value) || 0.01)}
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL SL ($)">
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
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Breakout & Grid Levels</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={zone.is_breakout}
              onChange={(e) => update('is_breakout', e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <span>Trend-direction only</span>
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
          <InputGroup label="Levels Below">
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
          <InputGroup label="Levels Above">
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
          <InputGroup label="Max Positions">
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
          <span>Clear when price exits zone</span>
        </label>
        {zone.clear_on_exit && (
          <>
            <hr className="border-white/5" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <InputGroup label="Exit Direction">
                <select
                  value={zone.clear_exit_side}
                  onChange={(e) => update('clear_exit_side', e.target.value)}
                  className="input-s"
                >
                  <option value="Farketmez">Any Direction</option>
                  <option value="BUY (Yukarı)">BUY (Up)</option>
                  <option value="SELL (Aşağı)">SELL (Down)</option>
                </select>
              </InputGroup>
              <InputGroup label="Target Side">
                <select
                  value={zone.clear_target_side}
                  onChange={(e) => update('clear_target_side', e.target.value)}
                  className="input-s"
                >
                  <option value="Farketmez (Hepsi)">All</option>
                  <option value="Sadece BUY İşlemleri">Only BUY</option>
                  <option value="Sadece SELL İşlemleri">Only SELL</option>
                </select>
              </InputGroup>
              <InputGroup label="Clear Scope">
                <select
                  value={zone.clear_scope}
                  onChange={(e) => update('clear_scope', e.target.value)}
                  className="input-s"
                >
                  <option value="Sadece Bekleyen Emirler">Pending Orders Only</option>
                  <option value="Tüm İşlemler">All Positions</option>
                </select>
              </InputGroup>
              <InputGroup label="Exit Trigger">
                <select
                  value={zone.exit_condition}
                  onChange={(e) => update('exit_condition', e.target.value)}
                  className="input-s"
                >
                  <option value="Anlık Fiyat">Instant Price</option>
                  <option value="Mum Kapanışı">Candle Close</option>
                </select>
              </InputGroup>
            </div>
            {zone.exit_condition === 'Mum Kapanışı' && (
              <div className="w-48">
                <InputGroup label="Timeframe">
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
