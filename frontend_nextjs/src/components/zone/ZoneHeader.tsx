'use client';

import { useState } from 'react';
import { MoreVertical, Trash2, Save, Play, Pause } from 'lucide-react';
import Link from 'next/link';
import type { ZoneHeaderProps } from './types';

export function ZoneHeader({
  zone,
  isActive,
  isGlobalRunning,
  modified,
  disableButtons,
  onToggleActive,
  onDelete,
}: ZoneHeaderProps) {
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
