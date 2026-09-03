'use client';

import { useCallback, useState, useEffect } from "react";
import axios from 'axios';
import {
  useBotStore,
  defaultZone,
  type ZoneSettings,
  type SymbolDetail,
} from "@/store/useBotStore";
import { MoreVertical, Plus, Trash2, AlertTriangle, Save, Play, Pause } from 'lucide-react';
import ConfirmModal from "@/components/ConfirmModal";
import Link from "next/link";
import SymbolAutoComplete from "@/components/SymbolAutoComplete";

const rawAPI = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
const API = rawAPI.endsWith("/api") ? rawAPI : `${rawAPI}/api`;

axios.defaults.headers.common["ngrok-skip-browser-warning"] = "true";

function zoneModified(original: ZoneSettings | undefined, current: ZoneSettings): boolean {
  if (!original) return true;
  const o = { ...original };
  const c = { ...current };
  // is_active değişikliği "Kaydedilmedi" uyarısını tetiklemesin
  delete o.is_active;
  delete c.is_active;
  return JSON.stringify(o) !== JSON.stringify(c);
}

// 🌟 Yardımcı: Sembolün hassasiyetine (digits) göre dinamik parseFloat
function parseFloatCustom(value: string, precision: number = 5): number {
  if (!value || value.trim() === "") return 0;
  const num = parseFloat(value);
  if (isNaN(num)) return 0;
  return Number(num.toFixed(precision));
}

// 🌟 Yardımcı: Sembol detayına göre min/step/precision hesapla
function getSymbolConfig(symbol: string, symbolDetails: Record<string, SymbolDetail>): { min: number; step: number; precision: number; volMin: number; volStep: number } {
  const detail = symbolDetails[symbol.toUpperCase()];
  if (!detail) {
    return { min: 0, step: 0.00001, precision: 5, volMin: 0.01, volStep: 0.01 };
  }
  const point = detail.point || 0.00001;
  const digits = detail.digits ?? 5;
  return {
    min: point,
    step: point,
    precision: digits,
    volMin: detail.volume_min ?? 0.01,
    volStep: detail.volume_step ?? 0.01,
  };
}

interface ZoneSettingsPanelProps {
  selectedAccount: string | null;
  isRunning: boolean;
  liveData: ReturnType<typeof useBotStore.getState>["liveData"];
  isGlobalDirty?: boolean;
}

export default function ZoneSettingsPanel({
  selectedAccount,
  isRunning,
  liveData,
  isGlobalDirty,
}: ZoneSettingsPanelProps) {
  const { settings, setZones } = useBotStore();
  const [prevAccount, setPrevAccount] = useState<string | null>(
    selectedAccount,
  );
  const [originalZones, setOriginalZones] = useState<ZoneSettings[]>([]);
  const [deleteZoneId, setDeleteZoneId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const mt5Connected = liveData.mt5_connected;
  const disableActionButtons = isRunning && !mt5Connected;
  const zones = settings?.ZONES || [];

  if (selectedAccount !== prevAccount) {
    setPrevAccount(selectedAccount);
    setOriginalZones([]);
  }

  if (zones.length > 0 && originalZones.length === 0) {
    setOriginalZones(zones.map((z) => ({ ...z })));
  }

  // EKSİK BAĞLANTI DÜZELTMESİ: Sembol detaylarını backend'den otomatik çekip Store'a yazan sistem
  useEffect(() => {
    if (selectedAccount) {
      axios
        .get(`${API}/symbols/${selectedAccount}`)
        .then((res) => {
          let symsData = res.data.symbols || res.data || {};
          if (typeof symsData === "string") {
            try {
              symsData = JSON.parse(symsData);
            } catch {}
          }

          // Düz string dizisi ["USOUSD"] veya Obje {"USOUSD":{}} gelme ihtimaline karşı tam koruma
          const syms: SymbolDetail[] = Array.isArray(symsData)
            ? symsData.map((s) => (typeof s === "string" ? { name: s } : s))
            : Object.entries(symsData).map(([key, val]) => {
                const detail = (typeof val === "object" ? val : {}) as Omit<
                  SymbolDetail,
                  "name"
                >;
                return { name: key, ...detail } as SymbolDetail;
              });

          useBotStore.getState().setAvailableSymbols(syms.map((s) => s.name));
          const details: Record<string, SymbolDetail> = {};
          syms.forEach((s) => {
            if (s.name) details[s.name.toUpperCase()] = s;
          });
          useBotStore.getState().setSymbolDetails(details);
        })
        .catch((err) => console.error("Sembol detayları çekilemedi", err));
    }
  }, [selectedAccount]);

  // YENİ: "Tüm Ayarları Kaydet" butonuna basıldığında (isDirty === false)
  // "Kaydedilmedi" uyarılarını sıfırlar (originalZones günceller).
  useEffect(() => {
    if (isGlobalDirty === false) {
      queueMicrotask(() => {
        const currentZones = useBotStore.getState().settings?.ZONES || [];
        setOriginalZones(currentZones.map((z) => ({ ...z })));
      });
    }
  }, [isGlobalDirty]);

  const updateZone = useCallback(
    (zoneId: string, field: string, value: unknown) => {
      setZones((prevZones) =>
        prevZones.map((z) => (z.id === zoneId ? { ...z, [field]: value } : z)),
      );
    },
    [setZones],
  );

  const toggleZoneActive = useCallback(
    async (zoneId: string, currentActive: boolean) => {
      const newActive = !currentActive;

      // KRİTİK KONTROL 2: Sembol broker tarafından desteklenmiyorsa başlatma
      const storeState = useBotStore.getState();
      const zoneSymbol = storeState.settings?.ZONES?.find(
        (z) => z.id === zoneId,
      )?.symbol;

      if (
        zoneSymbol &&
        Object.keys(storeState.symbolDetails).length > 0 &&
        !storeState.symbolDetails[zoneSymbol.toUpperCase().trim()]
      ) {
        alert(
          "Hatalı Sembol! Girdiğiniz sembol broker tarafından desteklenmiyor. Lütfen geçerli bir sembol girin.",
        );
        return;
      }

      // 1. UI anında tepki versin (Optimistic Update)
      setZones((prevZones) =>
        prevZones.map((z) =>
          z.id === zoneId ? { ...z, is_active: newActive } : z,
        ),
      );

      if (!selectedAccount) return;

      // 2. Kirli (kaydedilmemiş) değişiklikleri bozmadan SADECE is_active yolla
      try {
        // A. Sunucudaki son TEMİZ state'i çek
        const res = await axios.get(`${API}/settings/${selectedAccount}`);
        const remoteSettings = res.data?.settings || {};
        const remoteZones: ZoneSettings[] = remoteSettings.ZONES || [];

        // KRİTİK HATA DÜZELTMESİ: Bölge henüz sunucuda yoksa (yeni eklendiyse)
        const existsRemotely = remoteZones.some((z) => z.id === zoneId);
        if (!existsRemotely) {
          alert(
            "Bu bölge henüz kaydedilmemiş! Lütfen önce 'Tüm Ayarları Kaydet' butonuna basın.",
          );
          setZones((prevZones) =>
            prevZones.map((z) =>
              z.id === zoneId ? { ...z, is_active: currentActive } : z,
            ),
          );
          return;
        }

        // B. Sadece ilgili bölgenin aktifliğini değiştir
        const updatedZones = remoteZones.map((z) =>
          z.id === zoneId ? { ...z, is_active: newActive } : z,
        );

        // C. Temiz ayarları tekrar kaydet (Ekranda bekleyen değişiklikler güvende)
        await axios.post(`${API}/settings/${selectedAccount}`, {
          settings: { ...remoteSettings, ZONES: updatedZones },
        });

        // D. UI State dosyasını da güncelle (Engine bunu okuyarak zone START/PAUSE karar verir)
        const zoneIdx = remoteZones.findIndex((z) => z.id === zoneId);
        if (zoneIdx >= 0) {
          await axios.post(`${API}/ui-state/${selectedAccount}`, {
            settings: { states: { [zoneIdx]: newActive ? "START" : "PAUSE" } },
          });
        }
      } catch (err) {
        console.error("Bölge güncellenemedi", err);
        alert("Bölge durumu kaydedilemedi!");
        // Hata durumunda UI'ı eski haline geri döndür
        setZones((prevZones) =>
          prevZones.map((z) =>
            z.id === zoneId ? { ...z, is_active: currentActive } : z,
          ),
        );
      }
    },
    [setZones, selectedAccount],
  );

  const addZone = useCallback(() => {
    // Yeni bölge eklenirken, global olarak seçili olan sembolü otomatik miras al
    const currentGlobalSymbol =
      useBotStore.getState().settings?.SYMBOL || "USOUSD";
    setZones((prevZones) => [
      ...prevZones,
      { ...defaultZone(), symbol: currentGlobalSymbol },
    ]);
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
              setError("");
              if (liveData.last_error)
                useBotStore.getState().updateLiveData({ last_error: null });
            }}
            className="ml-auto text-red-400 hover:text-red-300 px-2 font-bold"
          >
            X
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

      {zones.map((zone) => {
        const origZone = originalZones.find((z) => z.id === zone.id);
        const modified = zoneModified(origZone, zone);

        return (
          <ZoneCard
            key={zone.id}
            zone={zone}
            modified={modified}
            disableButtons={disableActionButtons}
            onUpdate={updateZone}
            onToggleActive={toggleZoneActive}
            onDelete={() => setDeleteZoneId(zone.id)}
            liveData={liveData}
            isRunning={isRunning}
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
  modified: boolean;
  disableButtons: boolean;
  onUpdate: (zoneId: string, field: string, value: unknown) => void;
  onToggleActive: (zoneId: string, currentActive: boolean) => Promise<void>;
  onDelete: () => void;
  liveData: ReturnType<typeof useBotStore.getState>["liveData"];
  isRunning: boolean;
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
}: ZoneCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const symbolDetails = useBotStore((state) => state.symbolDetails);

  const update = (field: string, value: unknown) =>
    onUpdate(zone.id, field, value);

  const handleBlur = (field: string, value: number, step: number) => {
    if (value === undefined || value === null || isNaN(value) || !step) return;
    const precision = field.toLowerCase().includes("lot")
      ? step.toString().split(".")[1]?.length || 2
      : symbolConfig.precision;

    const rounded = Number(
      (Math.round(value / step) * step).toFixed(precision),
    );
    if (rounded !== value) update(field, rounded);
  };

  const isBoth = zone.order_type === "BOTH";
  const showBuyLabel = zone.order_type === "BUY";
  const showSellLabel = zone.order_type === "SELL";

  // Eski kayıtlarla geriye dönük uyumluluk için !== false kullanmaya devam ediyoruz
  const isActive = zone.is_active !== false;

  // Dürüst UI State Belirleme (4 Durum)
  const isGlobalRunning = liveData.mt5_connected && isRunning;

  // KÖR INPUTLARIN ÇÖZÜMÜ: O sembole ait point ve digits değerlerini dinamik hesapla
  const symbolConfig = getSymbolConfig(zone.symbol, symbolDetails);
  const stepStr = symbolConfig.volStep.toString();
  const volPrecision = stepStr.includes(".") ? stepStr.split(".")[1].length : 2;

  // Sembol değiştikçe veya detaylar yüklendikçe mevcut değerleri sembolün ondalığına (digits) otomatik eşitle
  useEffect(() => {
    const p = symbolConfig.precision;
    const vp = volPrecision;

    const fieldsToFix: Array<[string, number, number]> = [
      ["min_price", zone.min_price, p],
      ["max_price", zone.max_price, p],
      ["grid_step", zone.grid_step, p],
      ["take_profit", zone.take_profit, p],
      ["stop_loss", zone.stop_loss, p],
      ["sell_grid_step", zone.sell_grid_step, p],
      ["sell_take_profit", zone.sell_take_profit, p],
      ["sell_stop_loss", zone.sell_stop_loss, p],
      ["pullback_distance", zone.pullback_distance, p],
      ["sell_pullback_distance", zone.sell_pullback_distance, p],
      ["lot_size", zone.lot_size, vp],
      ["sell_lot_size", zone.sell_lot_size, vp],
    ];

    fieldsToFix.forEach(([field, val, prec]) => {
      if (typeof val === "number" && !isNaN(val)) {
        const rounded = Number(val.toFixed(prec));
        if (rounded !== val) {
          update(field, rounded);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolConfig.precision, volPrecision, zone.symbol]);
  let btnClass = "";
  let btnText = "";
  let btnIcon = <Play size={14} />;

  if (isGlobalRunning) {
    if (isActive) {
      btnClass =
        "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95";
      btnText = "Başladı";
      btnIcon = <Pause size={14} />;
    } else {
      btnClass = "bg-amber-600 hover:bg-amber-500 text-white active:scale-95";
      btnText = "Başla";
      btnIcon = <Play size={14} />;
    }
  } else {
    if (isActive) {
      // Pusuda bekleyen (Armed) bölge
      btnClass =
        "bg-yellow-600 text-yellow-50 hover:bg-yellow-500 active:scale-95";
      btnText = "Hazır (Motor Bekleniyor)";
      btnIcon = <Pause size={14} />;
    } else {
      // Tamamen pasif bölge
      btnClass = "bg-gray-700 text-gray-300 hover:bg-gray-600 active:scale-95";
      btnText = "Kapalı (Motoru Başlat)";
      btnIcon = <Play size={14} />;
    }
  }

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-xl shadow-xl space-y-4">
      {/* Zone Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* ... (sol taraf başlık kodları) ... */}
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

      <hr className="border-white/10" />

      {/* Row 1: Symbol, Order Type, Min, Max */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup label="Sembol">
          <SymbolAutoComplete
            value={zone.symbol}
            onChange={(val) => update("symbol", val)}
            symbolDetails={symbolDetails}
            hasError={
              Object.keys(symbolDetails).length > 0 &&
              Boolean(zone.symbol) &&
              !Object.keys(symbolDetails).some(
                (k) => k.toUpperCase() === zone.symbol.toUpperCase().trim(),
              )
            }
          />
          {Object.keys(symbolDetails).length > 0 &&
            zone.symbol &&
            !Object.keys(symbolDetails).some(
              (k) => k.toUpperCase() === zone.symbol.toUpperCase().trim(),
            ) && (
              <span className="text-[11px] text-red-400 font-bold mt-1">
                Geçersiz Sembol!
              </span>
            )}
        </InputGroup>
        <InputGroup label="Emir Tipi">
          <select
            value={zone.order_type}
            onChange={(e) => update("order_type", e.target.value)}
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
            step={symbolConfig.step}
            value={zone.min_price}
            onChange={(e) =>
              update(
                "min_price",
                parseFloatCustom(e.target.value, symbolConfig.precision),
              )
            }
            onBlur={() =>
              handleBlur("min_price", zone.min_price, symbolConfig.step)
            }
            className="input-s"
          />
        </InputGroup>
        <InputGroup label="Max Fiyat ($)">
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.max_price}
            onChange={(e) =>
              update(
                "max_price",
                parseFloatCustom(e.target.value, symbolConfig.precision),
              )
            }
            onBlur={() =>
              handleBlur("max_price", zone.max_price, symbolConfig.step)
            }
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
            onChange={(e) => update("sync_buy_sell", e.target.checked)}
            className="w-4 h-4 rounded accent-blue-500"
          />
          <label htmlFor={`sync-${zone.id}`} className="text-sm text-gray-300">
            BUY ve SELL için aynı ayarları uygula
          </label>
        </div>
      )}

      {/* Direction label */}
      {showBuyLabel && (
        <p className="text-sm text-green-400 font-semibold">
          BUY (Alış) Grid Ayarları
        </p>
      )}
      {showSellLabel && (
        <p className="text-sm text-red-400 font-semibold">
          SELL (Satış) Grid Ayarları
        </p>
      )}

      {/* Row 2: Grid, Lot, TP, SL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <InputGroup
          label={
            isBoth && zone.sync_buy_sell
              ? "Grid Adımı ($)"
              : isBoth
                ? "BUY Grid ($)"
                : "Grid Adımı ($)"
          }
        >
          <input
            type="number"
            min={symbolConfig.min}
            step={symbolConfig.step}
            value={zone.grid_step}
            onChange={(e) =>
              update(
                "grid_step",
                parseFloatCustom(e.target.value, symbolConfig.precision),
              )
            }
            onBlur={() =>
              handleBlur("grid_step", zone.grid_step, symbolConfig.step)
            }
            className="input-s"
          />
        </InputGroup>
        <InputGroup
          label={
            isBoth && zone.sync_buy_sell ? "Lot" : isBoth ? "BUY Lot" : "Lot"
          }
        >
          <input
            type="number"
            min={symbolConfig.volMin}
            step={symbolConfig.volStep}
            value={zone.lot_size}
            onChange={(e) =>
              update("lot_size", parseFloatCustom(e.target.value, volPrecision))
            }
            onBlur={() =>
              handleBlur("lot_size", zone.lot_size, symbolConfig.volStep)
            }
            className="input-s"
          />
        </InputGroup>
        <InputGroup
          label={
            isBoth && zone.sync_buy_sell
              ? "Kar Al ($)"
              : isBoth
                ? "BUY KA ($)"
                : "Kar Al ($)"
          }
        >
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.take_profit}
            onChange={(e) =>
              update(
                "take_profit",
                parseFloatCustom(e.target.value, symbolConfig.precision),
              )
            }
            onBlur={() =>
              handleBlur("take_profit", zone.take_profit, symbolConfig.step)
            }
            className="input-s"
          />
        </InputGroup>
        <InputGroup
          label={
            isBoth && zone.sync_buy_sell
              ? "Zarar Durdur ($)"
              : isBoth
                ? "BUY ZD ($)"
                : "Zarar Durdur ($)"
          }
        >
          <input
            type="number"
            min={0}
            step={symbolConfig.step}
            value={zone.stop_loss}
            onChange={(e) =>
              update(
                "stop_loss",
                parseFloatCustom(e.target.value, symbolConfig.precision),
              )
            }
            onBlur={() =>
              handleBlur("stop_loss", zone.stop_loss, symbolConfig.step)
            }
            className="input-s"
          />
        </InputGroup>
      </div>

      {/* SELL fields when BOTH and not synced */}
      {isBoth && !zone.sync_buy_sell && (
        <>
          <p className="text-sm text-red-400 font-semibold">
            SELL Grid Ayarları
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <InputGroup label="SELL Grid ($)">
              <input
                type="number"
                min={symbolConfig.min}
                step={symbolConfig.step}
                value={zone.sell_grid_step}
                onChange={(e) =>
                  update(
                    "sell_grid_step",
                    parseFloatCustom(e.target.value, symbolConfig.precision),
                  )
                }
                onBlur={() =>
                  handleBlur(
                    "sell_grid_step",
                    zone.sell_grid_step,
                    symbolConfig.step,
                  )
                }
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL Lot">
              <input
                type="number"
                min={symbolConfig.volMin}
                step={symbolConfig.volStep}
                value={zone.sell_lot_size}
                onChange={(e) =>
                  update(
                    "sell_lot_size",
                    parseFloatCustom(e.target.value, volPrecision),
                  )
                }
                onBlur={() =>
                  handleBlur(
                    "sell_lot_size",
                    zone.sell_lot_size,
                    symbolConfig.volStep,
                  )
                }
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL KA ($)">
              <input
                type="number"
                min={0}
                step={symbolConfig.step}
                value={zone.sell_take_profit}
                onChange={(e) =>
                  update(
                    "sell_take_profit",
                    parseFloatCustom(e.target.value, symbolConfig.precision),
                  )
                }
                onBlur={() =>
                  handleBlur(
                    "sell_take_profit",
                    zone.sell_take_profit,
                    symbolConfig.step,
                  )
                }
                className="input-s"
              />
            </InputGroup>
            <InputGroup label="SELL ZD ($)">
              <input
                type="number"
                min={0}
                step={symbolConfig.step}
                value={zone.sell_stop_loss}
                onChange={(e) =>
                  update(
                    "sell_stop_loss",
                    parseFloatCustom(e.target.value, symbolConfig.precision),
                  )
                }
                onBlur={() =>
                  handleBlur(
                    "sell_stop_loss",
                    zone.sell_stop_loss,
                    symbolConfig.step,
                  )
                }
                className="input-s"
              />
            </InputGroup>
          </div>
        </>
      )}

      {/* Breakout & Pullback */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
          Kırılım ve Pullback Seviyeleri
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={zone.is_breakout}
              onChange={(e) => update("is_breakout", e.target.checked)}
              className="w-4 h-4 rounded accent-blue-500"
            />
            <span>Sadece trend yönünde</span>
          </label>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-400 whitespace-nowrap">
              {isBoth && !zone.sync_buy_sell
                ? "BUY Pullback ($)"
                : "Min Pullback ($)"}
            </span>
            <input
              type="number"
              min={0}
              step={symbolConfig.step}
              value={zone.pullback_distance}
              onChange={(e) =>
                update(
                  "pullback_distance",
                  parseFloatCustom(e.target.value, symbolConfig.precision),
                )
              }
              onBlur={() =>
                handleBlur(
                  "pullback_distance",
                  zone.pullback_distance,
                  symbolConfig.step,
                )
              }
              disabled={!zone.is_breakout}
              className="input-s w-24"
            />
          </div>
          {isBoth && !zone.sync_buy_sell && (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-400 whitespace-nowrap">
                SELL Pullback ($)
              </span>
              <input
                type="number"
                min={0}
                step={symbolConfig.step}
                value={zone.sell_pullback_distance}
                onChange={(e) =>
                  update(
                    "sell_pullback_distance",
                    parseFloatCustom(e.target.value, symbolConfig.precision),
                  )
                }
                onBlur={() =>
                  handleBlur(
                    "sell_pullback_distance",
                    zone.sell_pullback_distance,
                    symbolConfig.step,
                  )
                }
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
              onChange={(e) =>
                update("levels_below", parseInt(e.target.value, 10) || 1)
              }
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
              onChange={(e) =>
                update("levels_above", parseInt(e.target.value, 10) || 1)
              }
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
              onChange={(e) =>
                update("max_positions", parseInt(e.target.value, 10) || 0)
              }
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
            onChange={(e) => update("clear_on_exit", e.target.checked)}
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
                  onChange={(e) => update("clear_exit_side", e.target.value)}
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
                  onChange={(e) => update("clear_target_side", e.target.value)}
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
                  onChange={(e) => update("clear_scope", e.target.value)}
                  className="input-s"
                >
                  <option value="Sadece Bekleyen Emirler">
                    Sadece Bekleyen Emirler
                  </option>
                  <option value="Tüm İşlemler">Tüm İşlemler</option>
                </select>
              </InputGroup>
              <InputGroup label="Çıkış Tetikleyici">
                <select
                  value={zone.exit_condition}
                  onChange={(e) => update("exit_condition", e.target.value)}
                  className="input-s"
                >
                  <option value="Anlık Fiyat">Anlık Fiyat</option>
                  <option value="Mum Kapanışı">Mum Kapanışı</option>
                </select>
              </InputGroup>
            </div>
            {zone.exit_condition === "Mum Kapanışı" && (
              <div className="w-48">
                <InputGroup label="Zaman Dilimi">
                  <select
                    value={zone.exit_timeframe}
                    onChange={(e) => update("exit_timeframe", e.target.value)}
                    className="input-s"
                  >
                    {["M1", "M5", "M15", "M30", "H1", "H4", "D1"].map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
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