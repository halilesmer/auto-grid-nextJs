'use client';

import { useState, type ChangeEvent, type ComponentPropsWithoutRef, type FocusEvent } from 'react';

type NumberInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value'> & {
  value: number | undefined;
};

const toText = (value: number | undefined) =>
  value === undefined || Number.isNaN(value) ? '' : String(value);

/**
 * `<input type="number">` mit lokalem Text-Entwurf. Der Eltern-Wert ist eine Zahl
 * (leer → 0 bzw. Minimum); würde man ihn direkt rendern, spränge das Feld beim
 * Löschen der letzten Ziffer sofort auf "0" zurück. Der Entwurf darf leer sein,
 * erst beim Verlassen des Feldes wird der echte Wert angezeigt.
 */
export function NumberInput({ value, onChange, onBlur, ...rest }: NumberInputProps) {
  const [draft, setDraft] = useState(() => toText(value));
  const [prevValue, setPrevValue] = useState(value);

  // Wert von außen geändert (Symbolwechsel, Laden, Blur-Rundung): Entwurf angleichen.
  // Ein leerer Entwurf bleibt erhalten, damit das Löschen nicht sofort überschrieben wird.
  if (value !== prevValue) {
    setPrevValue(value);
    if (draft !== '' && Number(draft) !== value) setDraft(toText(value));
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    onChange?.(e);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (draft === '' || Number(draft) !== value) setDraft(toText(value));
    onBlur?.(e);
  };

  return <input {...rest} type="number" value={draft} onChange={handleChange} onBlur={handleBlur} />;
}
