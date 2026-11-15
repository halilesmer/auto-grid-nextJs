'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { Tooltip } from './tooltip';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  /** false: başlık satırı çizilmez, içerik kendi başlığını (ve kapat düğmesini) taşır; Escape/arka plan yine kapatır. */
  chrome?: boolean;
  /** Erişilebilir ad, wenn kein Titel (chrome=false) da ist. */
  label?: string;
  /** Telefonda (sm altı) tam ekran: kenar boşluğu, yuvarlak köşe ve kenarlık yok. */
  mobileFull?: boolean;
}

// Escape'i bir alt öğe işlediyse (alan düzenlemesi geri alındı) `claimEscape` ile işaretler; pencere o olayda kapanmaz.
// `defaultPrevented` yetmez: başka bileşenler (hesap formu) Escape'te kendi nedenleriyle preventDefault çağırır.
const claimedEscapes = new WeakSet<Event>();
export function claimEscape(e: { preventDefault: () => void; nativeEvent: Event }) {
  e.preventDefault();
  claimedEscapes.add(e.nativeEvent);
}

// Açık pencereler (en üstteki sonda): Escape ve Tab yalnız en üsttekine gider (iç içe pencerelerde ikisi birden kapanmasın)
const openStack: string[] = [];

// Odak izi: pencere açılınca odağın nereden geldiği (otomatik odaklanan bir alt öğe odağı çalmış olsa da) bilinir
let focusNow: Element | null = null;
let focusBefore: Element | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    focusBefore = focusNow;
    focusNow = e.target as Element;
  });
}

const FOCUSABLE = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])', 'summary', '[tabindex]'].map((q) => `${q}:not([tabindex="-1"])`).join(',');
const focusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest('fieldset[disabled]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');

export function Modal({ open, onClose, title, icon, children, className, dismissible = true, chrome = true, label, mobileFull = false }: ModalProps) {
  const t = useT();
  // Anker bleibt an der Einbaustelle, um den Portal-Container zu bestimmen (erst im Browser vorhanden)
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape: yalnız en üstteki pencere kapanır; açık bir alt öğe (alan, liste) Escape'i kendisi işlediyse (`claimEscape`) pencere kapanmaz
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || claimedEscapes.has(e) || openStack[openStack.length - 1] !== id) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose, id]);

  // Açık pencere yığını ve odak dönüşü: kapanınca odak açan öğeye geri gider
  useEffect(() => {
    if (!open) return;
    openStack.push(id);
    const active = document.activeElement;
    const inside = dialogRef.current?.contains(active) ?? false;
    const opener = (inside ? focusBefore : active) as HTMLElement | null;
    return () => {
      const at = openStack.indexOf(id);
      if (at >= 0) openStack.splice(at, 1);
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, id]);

  // Pencere gösterilince odak pencerenin içine alınır (içeride zaten odak varsa dokunulmaz)
  const portalReady = anchor !== null;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && portalReady && dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
  }, [open, portalReady]);

  // Odak gövdeye düştüyse (odaklı düğme kalktı ya da kilitlendi) Tab onu pencereye geri alır; yoksa pencerenin dışına kaçardı
  useEffect(() => {
    if (!open) return;
    const onTab = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (e.key !== 'Tab' || !dialog || openStack[openStack.length - 1] !== id) return;
      const active = document.activeElement;
      if (active && active !== document.body && dialog.contains(active)) return;
      if (active && active !== document.body && !dialog.contains(active) && active.closest('[role="dialog"][aria-modal="true"]')) return; // üstte başka pencere
      e.preventDefault();
      (focusables(dialog)[e.shiftKey ? focusables(dialog).length - 1 : 0] ?? dialog).focus();
    };
    document.addEventListener('keydown', onTab, true);
    return () => document.removeEventListener('keydown', onTab, true);
  }, [open, id]);

  // Tab: odak pencerenin içinde döner (iç içe pencerede yalnız odağı taşıyan pencere işler)
  const onDialogKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const dialog = e.currentTarget;
    if (e.key !== 'Tab' || !dialog.contains(e.target as Node) || openStack[openStack.length - 1] !== id) return;
    const items = focusables(dialog);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Portal: sonst wird `fixed` relativ zu transformierten Vorfahren (Zonenkarten) positioniert.
  // Steckt das Modal in einem nativen <dialog> (showModal, Top Layer), muss es dort hinein – sonst liegt es dahinter.
  const fullscreen = typeof document !== 'undefined' ? document.fullscreenElement : null;
  const container = anchor ? (anchor.closest('dialog') ?? (fullscreen?.contains(anchor) ? fullscreen : document.body)) : null;

  // Im Vollbild einer Chartseite liegt `formation-main` mit z-70 im selben Stapelkontext: der Dialog muss darüber
  const inFullscreen = container !== null && container === fullscreen;

  return (
    <>
      <span ref={setAnchor} hidden />
      {container &&
        createPortal(
        <AnimatePresence>
          {open && (
            <div className={cn('fixed inset-0 flex items-center justify-center', mobileFull ? 'sm:p-4' : 'p-4', inFullscreen ? 'z-[100]' : 'z-[60]')}>
              <motion.div
                className="absolute inset-0 bg-overlay"
                data-testid="modal-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={dismissible ? onClose : undefined}
              />
              <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                onKeyDown={onDialogKeyDown}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
                className={cn(
                  'relative w-full max-w-md rounded-xl outline-none border border-border bg-popover p-6 text-popover-foreground shadow-2xl shadow-black/15 dark:shadow-black/60',
                  mobileFull && 'max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0',
                  className,
                )}
              >
                {chrome && (title || dismissible) && (
                  <div className="mb-4 flex items-center gap-3">
                    {icon}
                    {title && <h3 className="flex-1 text-base font-semibold tracking-tight">{title}</h3>}
                    {dismissible && (
                      <Tooltip content={t('ui.close.hint')} className="ml-auto">
                        <button
                          type="button"
                          onClick={onClose}
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          aria-label={t('ui.close')}
                        >
                          <X className="size-4" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
                {children}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
          container,
        )}
    </>
  );
}
