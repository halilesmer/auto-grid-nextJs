// Combobox: 21st.dev'deki combobox'lardan (shugar/combobox, patrick-xin/autocomplete) esinlenen,
// bağımlılıksız kendi uyarlamamız. 21st günlük kotası (2026-09-24) toast için kullanıldı.
// İki kullanım:
//  - <Combobox>: select benzeri; tetikleyici buton + arama kutulu açılır liste (hesap seçimi)
//  - <ComboboxAutocomplete>: serbest metin girişi + öneri listesi (sembol arama)
'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const popoverClass =
  'absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-2xl shadow-black/15 dark:shadow-black/60';

// Dışarı tıklanınca kapat
function useOutsideClose(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClose]);
}

// Vurgulanan öğeyi görünür alanda tut
function useScrollHighlighted(listRef: React.RefObject<HTMLUListElement | null>, index: number) {
  useEffect(() => {
    if (index < 0 || !listRef.current) return;
    const item = listRef.current.children[index] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [listRef, index]);
}

interface OptionListProps<T> {
  id: string;
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, state: { highlighted: boolean; selected: boolean }) => ReactNode;
  highlightedIndex: number;
  selectedKey?: string | null;
  onHighlight: (index: number) => void;
  onSelect: (item: T) => void;
  listRef: React.RefObject<HTMLUListElement | null>;
  className?: string;
}

function OptionList<T>({
  id,
  items,
  getKey,
  renderItem,
  highlightedIndex,
  selectedKey,
  onHighlight,
  onSelect,
  listRef,
  className,
}: OptionListProps<T>) {
  return (
    <ul ref={listRef} id={id} role="listbox" className={cn('max-h-60 overflow-y-auto p-1', className)}>
      {items.map((item, index) => {
        const key = getKey(item);
        const highlighted = index === highlightedIndex;
        const selected = selectedKey != null && key === selectedKey;
        return (
          <li
            key={key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={selected || highlighted}
            // mousedown'da seç: input blur'u listeyi kapatmadan önce
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => onHighlight(index)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 transition-colors',
              highlighted ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
            )}
          >
            <div className="min-w-0 flex-1">{renderItem(item, { highlighted, selected })}</div>
            {selected && <Check className="size-4 shrink-0 text-primary" />}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Select benzeri combobox                                              */
/* ------------------------------------------------------------------ */

interface ComboboxProps<T> {
  items: T[];
  value: string | null;
  onChange: (key: string) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => ReactNode;
  filter: (item: T, query: string) => boolean;
  renderItem?: (item: T, state: { highlighted: boolean; selected: boolean }) => ReactNode;
  placeholder?: ReactNode;
  searchPlaceholder?: string;
  emptyMessage?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Combobox<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  filter,
  renderItem,
  placeholder = 'Seçiniz…',
  searchPlaceholder = 'Ara…',
  emptyMessage = 'Sonuç bulunamadı',
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selectedItem = useMemo(
    () => (value ? items.find((i) => getKey(i) === value) : undefined),
    [items, value, getKey],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => filter(i, q)) : items;
  }, [items, query, filter]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
  }, []);

  useOutsideClose(wrapperRef, close);
  useScrollHighlighted(listRef, highlightedIndex);

  const openList = () => {
    if (disabled) return;
    const selectedIdx = value ? items.findIndex((i) => getKey(i) === value) : -1;
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const select = (item: T) => {
    onChange(getKey(item));
    close();
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((p) => (filtered.length === 0 ? -1 : p < filtered.length - 1 ? p + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((p) => (filtered.length === 0 ? -1 : p > 0 ? p - 1 : filtered.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filtered.length) select(filtered[highlightedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        triggerRef.current?.focus();
        break;
      case 'Tab':
        close();
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn('input-s flex items-center gap-2 text-left', className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selectedItem && 'text-muted-foreground')}>
          {selectedItem ? getLabel(selectedItem) : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={popoverClass}
          >
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                aria-controls={listId}
                aria-activedescendant={highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
                className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
            {filtered.length > 0 ? (
              <OptionList
                id={listId}
                items={filtered}
                getKey={getKey}
                renderItem={renderItem ?? ((item) => getLabel(item))}
                highlightedIndex={highlightedIndex}
                selectedKey={value}
                onHighlight={setHighlightedIndex}
                onSelect={select}
                listRef={listRef}
              />
            ) : (
              <div className="p-3 text-muted-foreground">{emptyMessage}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Serbest metinli autocomplete                                         */
/* ------------------------------------------------------------------ */

interface ComboboxAutocompleteProps<T>
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onSelect'> {
  inputValue: string;
  onInputChange: (value: string) => void;
  /** Önceden filtrelenmiş öneriler */
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, state: { highlighted: boolean; selected: boolean }) => ReactNode;
  onSelect: (item: T) => void;
  /** Liste boşken "bulunamadı" mesajı gösterilsin mi */
  showEmpty?: boolean;
  emptyMessage?: ReactNode;
}

export function ComboboxAutocomplete<T>({
  inputValue,
  onInputChange,
  items,
  getKey,
  renderItem,
  onSelect,
  showEmpty = false,
  emptyMessage = 'Sonuç bulunamadı',
  className,
  onFocus,
  ...inputProps
}: ComboboxAutocompleteProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useOutsideClose(wrapperRef, close);
  useScrollHighlighted(listRef, highlightedIndex);

  const select = (item: T) => {
    onSelect(item);
    close();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || items.length === 0) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setHighlightedIndex(e.key === 'ArrowDown' ? 0 : items.length - 1);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((p) => (p < items.length - 1 ? p + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((p) => (p > 0 ? p - 1 : items.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < items.length) select(items[highlightedIndex]);
        break;
      case 'Escape':
        close();
        inputRef.current?.blur();
        break;
      case 'Tab':
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          e.preventDefault();
          select(items[highlightedIndex]);
        }
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        role="combobox"
        value={inputValue}
        onChange={(e) => {
          onInputChange(e.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-activedescendant={highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
        className={cn('input-s', className)}
      />

      {open && items.length > 0 && (
        <div className={popoverClass}>
          <OptionList
            id={listId}
            items={items}
            getKey={getKey}
            renderItem={renderItem}
            highlightedIndex={highlightedIndex}
            onHighlight={setHighlightedIndex}
            onSelect={select}
            listRef={listRef}
          />
        </div>
      )}

      {open && showEmpty && items.length === 0 && (
        <div className={cn(popoverClass, 'p-3 text-muted-foreground')}>{emptyMessage}</div>
      )}
    </div>
  );
}
