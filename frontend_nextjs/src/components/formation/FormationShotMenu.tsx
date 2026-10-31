'use client';

import { useState, useSyncExternalStore } from 'react';
import { Camera, Copy, Download, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/animated-toast';
import { DropdownMenu, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n';

const canCopyImage = () => typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
const noSubscription = () => () => {};

/**
 * Knopf in der Kopfleiste: erzeugt ein Bild der gewählten Formation (Chart, Zeichnungen, Bedingungen) und lädt es
 * herunter oder kopiert es. `makeImage` baut das PNG; ohne Kandidat (`ready` false) ist der Knopf aus.
 */
export function FormationShotMenu({ ready, makeImage, fileName }: {
  ready: boolean;
  makeImage: () => Promise<Blob>;
  fileName: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  // Die Fähigkeit hängt vom Browser ab: serverseitig gilt „nein“, im Browser der echte Wert
  const copySupported = useSyncExternalStore(noSubscription, canCopyImage, () => false);

  // `action` bekommt das Bild als Promise: Safari verlangt, dass die Zwischenablage noch in der Nutzergeste beschrieben wird
  const run = async (action: (image: Promise<Blob>) => Promise<void>, doneKey: 'formation.shot.saved' | 'formation.shot.copied') => {
    setBusy(true);
    try {
      await action(makeImage());
      toast.success(t(doneKey));
    } catch (error) {
      console.error(error);
      toast.error(t('formation.shot.failed'));
    } finally {
      setBusy(false);
    }
  };

  const download = async (image: Promise<Blob>) => {
    const url = URL.createObjectURL(await image);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    // Firefox und Safari lesen die Adresse erst nach dem Klick; sofortiges Freigeben bricht den Download ab
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const copy = (image: Promise<Blob>) => navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);

  return (
    <DropdownMenu
      label={t('formation.shot.menu')}
      hint={ready ? t('formation.shot.menu.hint') : t('formation.shot.menu.empty.hint')}
      icon={busy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
      variant="ghost"
      size="icon-sm"
      align="left"
      className="max-lg:mr-1"
      panelClassName="w-60"
      triggerProps={{ disabled: !ready || busy, 'data-testid': 'formation-shot' }}
    >
      <DropdownMenuGroup>
        <DropdownMenuItem icon={<Download size={14} />} hint={t('formation.shot.download.hint')} data-testid="formation-shot-download" onSelect={() => run(download, 'formation.shot.saved')}>
          {t('formation.shot.download')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={<Copy size={14} />}
          hint={copySupported ? t('formation.shot.copy.hint') : t('formation.shot.copy.unsupported.hint')}
          disabled={!copySupported}
          data-testid="formation-shot-copy"
          onSelect={() => run(copy, 'formation.shot.copied')}
        >
          {t('formation.shot.copy')}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenu>
  );
}
