// 21st.dev: shugar/combobox
// 21st.dev: patrick-xin/autocomplete
// İki 21st bileşeninin yapı ve stilini, yeni bağımlılık eklemeden uyarladık:
//  - shugar/combobox: arama ikonlu giriş, açıkken dönen ok, seçim tiki, alana göre yukarı/aşağı açılma
//  - patrick-xin/autocomplete: data-slot yapısı, popup/öğe/boş-durum stilleri, data-highlighted
// Orijinaller @base-ui/react, class-variance-authority, @radix-ui/react-slot ve Geist yardımcı
// bileşenlerine bağlıydı; bunların yerine tema token'ları (globals.css) ve `.input-s` kullanılıyor.
// İki kullanım:
//  - <Combobox>: select benzeri; tetikleyici buton + arama kutulu açılır liste (hesap seçimi)
//  - <ComboboxAutocomplete>: serbest metin girişi + öneri listesi (sembol arama)
'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

// patrick-xin/autocomplete: AutocompleteContent (Portal/Positioner yerine absolute konum)
const popupClass = cn(
  'absolute left-0 right-0 z-50 flex flex-col overflow-hidden',
  'rounded-md border border-border bg-popover text-sm text-popover-foreground',
  'shadow-2xl shadow-black/15 dark:shadow-black/60',
  // Varsayılan: aşağı açıl; useFlipSide yer yoksa data-side="top" yazar (shugar/combobox)
  'top-full mt-1 data-[side=top]:top-auto data-[side=top]:bottom-full data-[side=top]:mt-0 data-[side=top]:mb-1',
);

// patrick-xin/autocomplete: AutocompleteEmpty
const emptyClass = 'p-3 text-center text-sm text-muted-foreground';

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

// shugar/combobox getPosition: aşağıda yer yoksa ve yukarıda varsa popup'ı yukarı aç.
// State yerine data-side DOM özniteliği yazılır (render döngüsü yok).
function useFlipSide(
  anchorRef: React.RefObject<HTMLElement | null>,
  popupRef: React.RefObject<HTMLElement | null>,
  open: boolean,
) {
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = anchorRef.current;
      const popup = popupRef.current;
      if (!anchor || !popup) return;
      const rect = anchor.getBoundingClientRect();
      const height = popup.offsetHeight + 4;
      const fitsBelow = rect.bottom + height <= window.innerHeight;
      const fitsAbove = rect.top - height >= 0;
      popup.dataset.side = !fitsBelow && fitsAbove ? 'top' : 'bottom';
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  });
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
}

// patrick-xin/autocomplete: AutocompleteList + AutocompleteItem, shugar/combobox: ComboboxOption tiki
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
}: OptionListProps<T>) {
  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      data-slot="combobox-list"
      className="max-h-60 scroll-py-1 overflow-y-auto p-1 outline-none"
    >
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
            data-slot="combobox-item"
            data-highlighted={highlighted || undefined}
            data-selected={selected || undefined}
            // mousedown'da seç: input blur'u listeyi kapatmadan önce
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => onHighlight(index)}
            className={cn(
              'flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 outline-none transition-colors',
              'hover:bg-accent data-highlighted:bg-accent data-highlighted:text-accent-foreground',
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
/* Select benzeri combobox (shugar/combobox)                            */
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
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps<T>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
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
  useFlipSide(triggerRef, popupRef, open);

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
    <div ref={wrapperRef} data-slot="combobox" className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled}
        data-slot="combobox-trigger"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn('input-s flex items-center gap-2 text-left', className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selectedItem && 'text-muted-foreground')}>
          {selectedItem ? getLabel(selectedItem) : (placeholder ?? t('ui.combobox.placeholder'))}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180 text-foreground',
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={popupRef}
            data-slot="combobox-content"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className={popupClass}
          >
            {/* shugar/combobox: ComboboxInput prefix arama ikonu */}
            <div
              data-slot="combobox-input-group"
              className="flex items-center gap-2 border-b border-border px-3"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder ?? t('ui.combobox.search')}
                autoComplete="off"
                aria-controls={listId}
                aria-activedescendant={highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
                data-slot="combobox-input"
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
              <div data-slot="combobox-empty" className={emptyClass}>
                {emptyMessage ?? t('ui.combobox.empty')}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Serbest metinli autocomplete (patrick-xin/autocomplete)              */
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
  emptyMessage,
  className,
  onFocus,
  ...inputProps
}: ComboboxAutocompleteProps<T>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const showList = open && items.length > 0;
  const showEmptyState = open && showEmpty && items.length === 0;

  const close = useCallback(() => {
    setOpen(false);
    setHighlightedIndex(-1);
  }, []);

  useOutsideClose(wrapperRef, close);
  useScrollHighlighted(listRef, highlightedIndex);
  useFlipSide(inputRef, popupRef, showList || showEmptyState);

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
        // Tab vurgulanan öneriyi alır
        if (highlightedIndex >= 0 && highlightedIndex < items.length) {
          e.preventDefault();
          select(items[highlightedIndex]);
        }
        break;
    }
  };

  return (
    <div ref={wrapperRef} data-slot="autocomplete" className="relative w-full">
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
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined}
        data-slot="autocomplete-input"
        className={cn('input-s', className)}
      />

      {(showList || showEmptyState) && (
        <div ref={popupRef} data-slot="autocomplete-content" className={popupClass}>
          {showList ? (
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
          ) : (
            <div data-slot="autocomplete-empty" className={emptyClass}>
              {emptyMessage ?? t('ui.combobox.empty')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
