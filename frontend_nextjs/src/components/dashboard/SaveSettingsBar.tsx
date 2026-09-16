'use client';

import { Save } from 'lucide-react';

interface SaveSettingsBarProps {
  isDirty: boolean;
  isLoading: boolean;
  hasSettings: boolean;
  onSave: () => Promise<void>;
}

export default function SaveSettingsBar({
  isDirty,
  isLoading,
  hasSettings,
  onSave,
}: SaveSettingsBarProps) {
  const disabled = isLoading || !hasSettings || !isDirty;

  return (
    <button
      onClick={onSave}
      disabled={disabled}
      className={`w-full sm:w-auto flex items-center justify-center space-x-2 font-bold py-4 px-6 rounded-xl transition-all active:scale-[0.98] focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
        isDirty && !isLoading
          ? 'bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/30'
          : 'bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed border border-white/5'
      }`}
    >
      <Save size={24} />
      <span className="text-lg">
        {isLoading
          ? 'Kaydediliyor...'
          : isDirty
          ? 'Tüm Ayarları Kaydet'
          : 'Kaydedildi'}
      </span>
    </button>
  );
}