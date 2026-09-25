'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, DownloadCloud, Loader2, RefreshCw, Server } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';

interface UpdateResult {
  hasUpdate: boolean;
  localVer: string;
  remoteVer: string;
  loading: boolean;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateResult: UpdateResult | null;
  onApplyUpdate: () => void;
}

export default function UpdateModal({
  isOpen,
  onClose,
  updateResult,
  onApplyUpdate,
}: UpdateModalProps) {
  const t = useT();
  return (
    <Modal
      open={isOpen && !!updateResult}
      onClose={onClose}
      title={t('update.title')}
      icon={
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <RefreshCw size={18} />
        </div>
      }
    >
      {updateResult?.loading ? (
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('update.checking')}
        </div>
      ) : updateResult?.hasUpdate ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-warning">{t('update.available')}</p>
          <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/60 p-4 font-mono text-sm">
            <span className="text-muted-foreground">{updateResult.localVer}</span>
            <ArrowRight size={14} className="text-muted-foreground" />
            <span className="font-semibold text-success">{updateResult.remoteVer}</span>
          </div>
          <Button variant="success" wrapperClassName="w-full" onClick={onApplyUpdate} hint={t('update.apply.hint')}>
            <DownloadCloud size={16} />
            {t('update.apply')}
          </Button>
        </div>
      ) : updateResult ? (
        <div className="flex items-center gap-3 rounded-lg border border-success/25 bg-success/[0.06] p-4">
          <CheckCircle2 size={18} className="text-success" />
          <div className="text-sm">
            <p className="font-medium text-foreground">{t('update.upToDate')}</p>
            <p className="font-mono text-xs text-muted-foreground">{updateResult.localVer}</p>
          </div>
        </div>
      ) : null}
      {/* Update/Neustart auch ohne erreichbaren Worker: per SSH über die VPS-Seite (nur lokal) */}
      <Tooltip content={t('update.vpsLink.hint')} className="mt-4 flex w-full">
        <Link
          href="/vps"
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <Server size={12} />
          {t('update.vpsLink')}
        </Link>
      </Tooltip>
      <Button variant="ghost" wrapperClassName="mt-2 w-full" onClick={onClose} hint={t('common.close.hint')}>
        {t('common.close')}
      </Button>
    </Modal>
  );
}
