'use client';

import type { ComponentProps } from 'react';
import { Switch } from '@/components/ui/switch';

/**
 * Schalter in einer Feldzeile des Setups: steht neben dem Feld, das er steuert, auf der Höhe der Eingabefelder.
 * Der Platzhalter oben hat die Höhe der Feldbeschriftung (InputField: Zeile h-4, Abstand gap-1.5). Er fällt weg,
 * wenn der Schalter allein in seiner Zeile steht, und auf dem Handy, wo der Schalter fast immer in eine eigene
 * Zeile umbricht und der Platzhalter nur eine Lücke wäre.
 */
export function FieldSwitch(props: Omit<ComponentProps<typeof Switch>, 'className'>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden className="h-4 max-sm:hidden [:only-child>&]:hidden" />
      <Switch {...props} className="min-h-9" />
    </div>
  );
}
