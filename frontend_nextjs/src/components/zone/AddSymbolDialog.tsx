'use client';

import { useState } from 'react';
import { Info, Plus } from 'lucide-react';
import SymbolAutoComplete from '@/components/SymbolAutoComplete';
import { Button } from '@/components/ui/button';
import { InputField } from '@/components/ui/InputField';
import { Modal } from '@/components/ui/modal';
import { useT } from '@/i18n';
import type { SymbolDetail } from '@/store/types';

interface AddSymbolDialogProps {
  open: boolean;
  onClose: () => void;
  /** Symbole, die schon eine Karte haben: dorthin kommt das neue Setup */
  existingSymbols: string[];
  symbolDetails: Record<string, SymbolDetail>;
  validateSymbol: (symbol: string) => boolean;
  onAdd: (symbol: string) => void;
}

/** „Sembol Ekle“ (ZON-20): Symbol wählen, das erste Setup entsteht danach automatisch. */
export function AddSymbolDialog({ open, onClose, existingSymbols, symbolDetails, validateSymbol, onAdd }: AddSymbolDialogProps) {
  const t = useT();
  const [symbol, setSymbol] = useState('');
  const isValid = symbol !== '' && validateSymbol(symbol);
  const isInvalidInput = symbol !== '' && !isValid;
  const exists = isValid && existingSymbols.includes(symbol);

  const close = () => {
    setSymbol('');
    onClose();
  };

  const add = () => {
    if (!isValid) return;
    onAdd(symbol);
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('zone.panel.add')}
      icon={
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Plus size={18} />
        </div>
      }
    >
      <form
        data-testid="add-symbol-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <p className="text-sm leading-relaxed text-muted-foreground">{t('zone.addSymbol.text')}</p>
        <div className="mt-4">
          <InputField
            label={t('zone.field.symbol')}
            hint={t('zone.addSymbol.symbol.hint')}
            error={isInvalidInput && <span className="text-[11px] font-semibold text-danger">{t('zone.field.symbolInvalid')}</span>}
          >
            <SymbolAutoComplete value="" onChange={setSymbol} symbolDetails={symbolDetails} hasError={isInvalidInput} />
          </InputField>
        </div>
        {exists && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
            <Info size={14} className="mt-0.5 shrink-0 text-info" />
            <span>{t('zone.addSymbol.exists', { symbol })}</span>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close} hint={t('common.cancel.hint')}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!isValid}
            hint={isValid ? t('zone.addSymbol.confirm.hint') : t('zone.addSymbol.confirm.off.hint')}
          >
            {t('zone.addSymbol.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
