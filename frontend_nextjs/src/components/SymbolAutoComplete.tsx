"use client";

import { useCallback, useMemo, useState } from "react";

import { ComboboxAutocomplete } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { SymbolDetail } from "@/store/types";
import { useT } from "@/i18n";

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
  const t = useT();
  const [searchTerm, setSearchTerm] = useState(value);

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

  const handleInputChange = useCallback(
    (val: string) => {
      setSearchTerm(val);
      onChange(val.toUpperCase().trim());
    },
    [onChange],
  );

  const handleSelectSymbol = useCallback(
    (sym: SymbolDetail) => {
      const normalized = sym.name.toUpperCase().trim();
      setSearchTerm(normalized);
      onChange(normalized);
    },
    [onChange],
  );

  return (
    <ComboboxAutocomplete
      inputValue={searchTerm}
      onInputChange={handleInputChange}
      items={filteredSymbols}
      getKey={(sym) => sym.name}
      onSelect={handleSelectSymbol}
      renderItem={(sym) => (
        <div className="flex flex-col">
          <span className="font-mono font-semibold text-foreground">{sym.name}</span>
          {sym.description && (
            <span className="line-clamp-1 text-xs text-muted-foreground">{sym.description}</span>
          )}
        </div>
      )}
      showEmpty={shouldFilter && symbols.length > 0}
      emptyMessage={t("zone.symbol.empty")}
      placeholder={t("zone.symbol.placeholder")}
      className={cn(
        "font-mono font-semibold placeholder:font-sans placeholder:font-normal",
        hasError && "border-danger! text-danger",
        className,
      )}
    />
  );
}
