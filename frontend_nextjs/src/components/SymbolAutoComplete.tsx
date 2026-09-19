"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

import { SymbolDetail } from "@/store/types";

interface SymbolAutoCompleteProps {
  value: string;
  onChange: (val: string) => void;
  symbolDetails: Record<string, SymbolDetail>;
  className?: string;
  hasError?: boolean;
}

const MIN_SEARCH_LENGTH = 1;

export default function SymbolAutoComplete({
  value,
  onChange,
  symbolDetails,
  className = "",
  hasError = false,
}: SymbolAutoCompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const symbols = useMemo(() => Object.values(symbolDetails), [symbolDetails]);
  const searchLower = (searchTerm || "").toLowerCase();
  const shouldFilter = searchLower.length >= MIN_SEARCH_LENGTH;

  const filteredSymbols = useMemo(() => {
    if (!shouldFilter) return [];
    return symbols.filter(
      (sym) =>
        sym.name.toLowerCase().includes(searchLower) ||
        (sym.description && sym.description.toLowerCase().includes(searchLower)),
    );
  }, [symbols, searchLower, shouldFilter]);

  const handleSelectSymbol = useCallback(
    (symbolName: string) => {
      const normalized = symbolName.toUpperCase().trim();
      setSearchTerm(normalized);
      onChange(normalized);
      setIsOpen(false);
      setHighlightedIndex(-1);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen || filteredSymbols.length === 0) {
        if (e.key === "Escape") {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setIsOpen(true);
          setHighlightedIndex(e.key === "ArrowDown" ? 0 : filteredSymbols.length - 1);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredSymbols.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredSymbols.length - 1,
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < filteredSymbols.length) {
            handleSelectSymbol(filteredSymbols[highlightedIndex].name);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          inputRef.current?.blur();
          break;
        case "Tab":
          if (highlightedIndex >= 0 && highlightedIndex < filteredSymbols.length) {
            e.preventDefault();
            handleSelectSymbol(filteredSymbols[highlightedIndex].name);
          }
          break;
      }
    },
    [isOpen, filteredSymbols, highlightedIndex, handleSelectSymbol],
  );

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  const errorClass = hasError
    ? "border-red-500 text-red-400 focus:ring-red-500"
    : "border-white/20 text-white focus:ring-blue-500";

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        value={searchTerm}
        onChange={(e) => {
          const val = e.target.value;
          setSearchTerm(val);
          onChange(val.toUpperCase().trim());
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={`w-full bg-black/40 border rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 transition-all ${errorClass} ${className}`}
        placeholder="Sembol Ara... (Örn: USOUSD)"
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls="symbol-suggestions"
      />

      {isOpen && filteredSymbols.length > 0 && (
        <ul
          ref={listRef}
          id="symbol-suggestions"
          role="listbox"
          className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-gray-800 border border-gray-600 rounded-lg shadow-2xl text-sm scrollbar-thin scrollbar-thumb-gray-600"
        >
          {filteredSymbols.map((sym, index) => (
            <li
              key={sym.name}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={() => handleSelectSymbol(sym.name)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-3 py-2 cursor-pointer flex flex-col transition-colors border-b border-gray-700/50 last:border-none ${
                index === highlightedIndex ? "bg-blue-600" : "hover:bg-blue-600"
              }`}
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

      {isOpen && shouldFilter && filteredSymbols.length === 0 && symbols.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-3 text-sm text-gray-400">
          Sembol bulunamadı
        </div>
      )}
    </div>
  );
}