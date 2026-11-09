'use client';

import { useState, type ChangeEvent, type ClipboardEvent, type ComponentPropsWithoutRef, type FocusEvent, type KeyboardEvent } from 'react';

type NumberInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value'> & {
  value: number | undefined;
  /** Max. Nachkommastellen (Symbol-Digits bzw. Lot-Schritt); weitere Ziffern werden nicht angenommen. */
  maxDecimals?: number;
};

const decimalsIn = (text: string) => text.split(/[.,]/)[1]?.length ?? 0;

const clip = (text: string, maxDecimals: number | undefined) => {
  if (maxDecimals === undefined || decimalsIn(text) <= maxDecimals) return text;
  const [int, frac] = text.split(/[.,]/);
  return maxDecimals > 0 ? `${int}.${frac.slice(0, maxDecimals)}` : int;
};

/**
 * Dezimaltrenner: Komma und Punkt gelten beide. `type="number"` nimmt je nach Browser-Sprache
 * nur eines davon an (sonst wird der Wert leer); deshalb wird ein getipptes oder eingefügtes
 * Komma als Punkt eingesetzt. execCommand('insertText') hält Cursor, Undo und das input-Ereignis.
 */
export function handleDecimalKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== ',' || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  document.execCommand('insertText', false, '.');
}

export function handleDecimalPaste(e: ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData('text');
  if (!text.includes(',')) return;
  e.preventDefault();
  document.execCommand('insertText', false, text.replace(/,/g, '.'));
}

const toText = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? '' : String(value);

/**
 * `<input type="number">` mit lokalem Text-Entwurf. Der Eltern-Wert ist eine Zahl
 * (leer → 0 bzw. Minimum); würde man ihn direkt rendern, spränge das Feld beim
 * Löschen der letzten Ziffer sofort auf "0" zurück. Der Entwurf darf leer sein,
 * erst beim Verlassen des Feldes wird der echte Wert angezeigt.
 */
export function NumberInput({ value, maxDecimals, onChange, onBlur, onKeyDown, onPaste, ...rest }: NumberInputProps) {
  const [draft, setDraft] = useState(() => toText(value));
  const [prevValue, setPrevValue] = useState(value);

  // Wert von außen geändert (Symbolwechsel, Laden, Blur-Rundung): Entwurf angleichen.
  // Ein leerer Entwurf bleibt erhalten, damit das Löschen nicht sofort überschrieben wird.
  // Object.is statt !==: NaN (leeres Feld) ist sich selbst ungleich und löste sonst
  // bei jedem Rendern ein setPrevValue aus → „Too many re-renders“.
  let nextDraft = draft;
  if (!Object.is(value, prevValue)) {
    setPrevValue(value);
    if (draft !== '' && Number(draft) !== value) nextDraft = toText(value);
  }
  // Symbolwechsel: zu lange Nachkommastellen im Entwurf kürzen. Auf den neuen Entwurf
  // anwenden – sonst überschreibt das Kürzen des alten Texts einen gleichzeitig neuen Wert
  // (Umschalten „Abstand nach Verlust“: 0.001 → 10 $ mit 2 Stellen ergab „0.00“).
  nextDraft = clip(nextDraft, maxDecimals);
  if (nextDraft !== draft) setDraft(nextDraft);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (maxDecimals !== undefined && decimalsIn(e.target.value) > maxDecimals) {
      e.target.value = draft;
      return;
    }
    if (maxDecimals === 0 && /[.,]/.test(e.target.value)) {
      e.target.value = draft;
      return;
    }
    setDraft(e.target.value);
    onChange?.(e);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (draft === '' || Number(draft) !== value) setDraft(toText(value));
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="number"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={(e) => { handleDecimalKeyDown(e); onKeyDown?.(e); }}
      onPaste={(e) => { handleDecimalPaste(e); onPaste?.(e); }}
    />
  );
}
