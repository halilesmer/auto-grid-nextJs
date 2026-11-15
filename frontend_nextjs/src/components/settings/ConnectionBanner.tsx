"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormat, useT, type MessageKey } from "@/i18n";
import { cn } from "@/lib/utils";
import { runConnectionCheck } from "@/lib/connectionCheck";
import { useConnectionDialogStore } from "@/store/useConnectionDialogStore";
import { useConnectionStore } from "@/store/useConnectionStore";
import { useSettingsDialogStore } from "@/store/useSettingsDialogStore";
import { ACTION_KEY, BANNER_LOOK, isBannerStatus } from "./connectionUi";

/**
 * Kişisel bölümlerin üstündeki bağlantı bandı (1115-A7.1/A7.2): bağlantı yokken sebebi, son başarılı kontrolü ve
 * duruma uygun eylemi gösterir. Bağlıyken ya da kontrol sürerken görünmez (yükleme kapısı S3'te).
 */
export default function ConnectionBanner() {
  const t = useT();
  const f = useFormat();
  const hydrated = useConnectionStore((s) => s.hydrated);
  const status = useConnectionStore((s) => s.status);
  const lastOkAt = useConnectionStore((s) => s.lastOkAt);
  const probing = useConnectionStore((s) => s.probing);
  const showConnection = useConnectionDialogStore((s) => s.show);
  const hide = useSettingsDialogStore((s) => s.hide);
  const setSection = useSettingsDialogStore((s) => s.setSection);

  if (!hydrated || !isBannerStatus(status)) return null;
  const look = BANNER_LOOK[status];
  const Icon = look.icon;
  const meta = lastOkAt
    ? t("sdlg.cb.meta", { time: f.time(lastOkAt) })
    : t("sdlg.cb.meta.never");
  const openDialog = () => {
    hide();
    showConnection();
  };

  return (
    <div
      data-testid="connection-banner"
      data-status={status}
      className={cn(
        "mt-4 flex flex-col gap-3 rounded-xl border p-4",
        look.frame,
      )}
    >
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-lg",
              look.chip,
            )}
          >
            <Icon size={17} />
          </span>
          <span className="font-semibold" data-testid="connection-banner-title">
            {t(`sdlg.cb.${status}.title` as MessageKey)}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          {t(`sdlg.cb.${status}.body` as MessageKey)}
        </p>
      </div>
      {status !== "unconfigured" && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="connection-banner-meta"
        >
          {probing ? t("sdlg.cb.checking") : meta}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {status === "unreachable" && (
          <>
            <Button
              variant="outline"
              className="min-h-11 md:min-h-9"
              disabled={probing}
              hint={t("sdlg.cb.retry.hint")}
              data-testid="connection-banner-retry"
              onClick={() => void runConnectionCheck()}
            >
              {probing && (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {probing ? t("sdlg.cb.retrying") : t("sdlg.cb.retry")}
            </Button>
            <Button
              variant="ghost"
              className="min-h-11 md:min-h-9"
              hint={t("sdlg.cb.settings.hint")}
              data-testid="connection-banner-settings"
              onClick={() => setSection("connection")}
            >
              {t("sdlg.cb.settings")}
            </Button>
          </>
        )}
        {status !== "unreachable" && (
          <Button
            variant={status === "unconfigured" ? "primary" : "outline"}
            className="min-h-11 md:min-h-9"
            hint={t(`sdlg.cb.${ACTION_KEY[status]}.hint` as MessageKey)}
            data-testid="connection-banner-action"
            onClick={openDialog}
          >
            {t(`sdlg.cb.${ACTION_KEY[status]}` as MessageKey)}
          </Button>
        )}
      </div>
    </div>
  );
}
