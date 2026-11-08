'use client';

import { Save, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

/** "Vazgeç" ve "Kaydet" bir setup'ın düzenleme hâlinde (ZON-22). Masaüstünde başlıkta, 640 px altında formun altında durur. */
export function ZoneEditActions({
  modified,
  isNew,
  saving,
  onCancel,
  onSave,
}: {
  modified: boolean;
  /** Hiç kaydedilmemiş setup: "Vazgeç" onu siler */
  isNew: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={onCancel}
        disabled={saving}
        hint={t(isNew ? 'zone.header.cancel.new.hint' : 'zone.header.cancel.hint')}
        data-testid="zone-cancel"
      >
        <Undo2 size={13} />
        {t('zone.header.cancel')}
      </Button>
      <Button
        size="sm"
        variant={modified ? 'primary' : 'secondary'}
        onClick={onSave}
        loading={saving}
        disabled={!modified}
        hint={modified ? t('zone.header.save.hint') : t('zone.header.save.off.hint')}
        data-testid="zone-save"
      >
        {!saving && <Save size={13} />}
        {t('common.save')}
      </Button>
    </>
  );
}
