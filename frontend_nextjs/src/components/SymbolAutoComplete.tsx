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
    ? "border-danger! text-danger"
    : "";

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
        className={`input-s font-mono font-semibold placeholder:font-sans placeholder:font-normal ${errorClass} ${className}`}
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
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-2xl shadow-black/15 dark:shadow-black/60"
        >
          {filteredSymbols.map((sym, index) => (
            <li
              key={sym.name}
              role="option"
              aria-selected={index === highlightedIndex}
              onClick={() => handleSelectSymbol(sym.name)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`flex cursor-pointer flex-col rounded-md px-3 py-2 transition-colors ${
                index === highlightedIndex ? "bg-accent" : "hover:bg-accent"
              }`}
            >
              <span className="font-mono font-semibold text-foreground">{sym.name}</span>
              {sym.description && (
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {sym.description}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && shouldFilter && filteredSymbols.length === 0 && symbols.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover p-3 text-sm text-muted-foreground shadow-2xl shadow-black/15 dark:shadow-black/60">
          Sembol bulunamadı
        </div>
      )}
    </div>
  );
}