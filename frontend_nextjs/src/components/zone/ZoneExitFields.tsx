'use client';

import type { ZoneExitFieldsProps } from './types';
import { InputField } from '@/components/ui/InputField';

export function ZoneExitFields({
  zone,
  update,
}: ZoneExitFieldsProps) {
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
