"use client";

import { useEffect, useRef, useState } from "react";

import { SymbolDetail } from "@/store/useBotStore";

interface SymbolAutoCompleteProps {
  value: string;
  onChange: (val: string) => void;
  symbolDetails: Record<string, SymbolDetail>;
  className?: string;
  hasError?: boolean;
}

export default function SymbolAutoComplete({
  value,
  onChange,
  symbolDetails,
  className = "",
  hasError = false,
}: SymbolAutoCompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Dışarıdan değer değişirse render sırasında inputu güncelle (ESLint fix)
  if (value !== prevValue) {
    setPrevValue(value);
    setSearchTerm(value);
  }

  // Dışarı tıklamayı algıla ve açılır menüyü kapat
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const symbols = Object.values(symbolDetails);
  const searchLower = (searchTerm || "").toLowerCase();

  // Hem sembol adına (USOUSD) hem de açıklamasına (Oil) göre filtreleme
  const filteredSymbols = symbols.filter(
    (sym) =>
      sym.name.toLowerCase().includes(searchLower) ||
      (sym.description && sym.description.toLowerCase().includes(searchLower)),
  );

  // Hata durumuna göre input kenarlığını kırmızı yap
  const errorClass = hasError
    ? "border-red-500 text-red-400 focus:ring-red-500"
    : "border-white/20 text-white focus:ring-blue-500";

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          onChange(e.target.value.toUpperCase().trim());
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 transition-all ${errorClass} ${className}`}
        placeholder="Sembol Ara... (Örn: USOUSD)"
        autoComplete="off"
      />

      {/* Açılır Menü Listesi */}
      {isOpen && filteredSymbols.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-2xl text-sm scrollbar-thin scrollbar-thumb-gray-600">
          {filteredSymbols.map((sym) => (
            <li
              key={sym.name}
              onClick={() => {
                setSearchTerm(sym.name);
                onChange(sym.name);
                setIsOpen(false);
              }}
              className="px-3 py-2 cursor-pointer hover:bg-blue-600 flex flex-col transition-colors border-b border-gray-700/50 last:border-none"
            >
              <span className="font-bold text-white">{sym.name}</span>
              {sym.description && (
                <span className="text-xs text-gray-400 line-clamp-1">
                  {sym.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
