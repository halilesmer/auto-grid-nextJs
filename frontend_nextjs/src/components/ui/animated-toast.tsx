// 21st.dev: dev.shejanmahamud/animated-toast
// Uyarlama: Context yerine küçük bir Zustand store (her yerden `toast.success(...)`
// çağrılabilsin diye), tema token'ları (success/danger/warning/info), mobilde tam genişlik.
'use client';

import { useEffect } from 'react';
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { create } from 'zustand';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'default';

export interface ToastItemData {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration: number; // ms; 0 = otomatik kapanmaz
}

type ToastInput = Omit<ToastItemData, 'id' | 'type' | 'duration'> & {
  type?: ToastType;
  duration?: number;
};

interface ToastStore {
  toasts: ToastItemData[];
  add: (toast: ToastInput) => string;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX_TOASTS = 5;
let counter = 0;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) => {
    const id = `t${Date.now().toString(36)}${(counter++).toString(36)}`;
    const item: ToastItemData = {
      type: 'default',
      // Hatalar biraz daha uzun kalsın, okunabilsin
      duration: toast.type === 'error' ? 8000 : 4000,
      ...toast,
      id,
    };
    set((s) => ({ toasts: [...s.toasts, item].slice(-MAX_TOASTS) }));
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

type Opts = Omit<ToastInput, 'message' | 'type'>;

// React dışından da (hook, store, handler) kullanılabilen API
export const toast = Object.assign(
  (message: string, opts?: Opts) => useToastStore.getState().add({ message, ...opts }),
  {
    success: (message: string, opts?: Opts) =>
      useToastStore.getState().add({ message, type: 'success', ...opts }),
    error: (message: string, opts?: Opts) =>
      useToastStore.getState().add({ message, type: 'error', ...opts }),
    warning: (message: string, opts?: Opts) =>
      useToastStore.getState().add({ message, type: 'warning', ...opts }),
    info: (message: string, opts?: Opts) =>
      useToastStore.getState().add({ message, type: 'info', ...opts }),
    dismiss: (id?: string) =>
      id ? useToastStore.getState().remove(id) : useToastStore.getState().clear(),
  },
);

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <AlertCircle className="size-5 text-danger" />,
  warning: <AlertTriangle className="size-5 text-warning" />,
  info: <Info className="size-5 text-info" />,
  default: <Bell className="size-5 text-muted-foreground" />,
};

const borderColors: Record<ToastType, string> = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
  info: 'border-l-info',
  default: 'border-l-border',
};

const progressColors: Record<ToastType, string> = {
  success: 'bg-success/40',
  error: 'bg-danger/40',
  warning: 'bg-warning/40',
  info: 'bg-info/40',
  default: 'bg-muted-foreground/30',
};

function ToastItem({ toast: t, index }: { toast: ToastItemData; index: number }) {
  const translate = useT();
  const remove = useToastStore((s) => s.remove);
  const { id, type, title, message, duration } = t;

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => remove(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, remove]);

  return (
    <motion.div
      layout
      role={type === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring', stiffness: 500, damping: 30, delay: index * 0.05 },
      }}
      exit={{ opacity: 0, scale: 0.9, x: 100, transition: { duration: 0.2 } }}
      className={cn(
        'pointer-events-auto relative w-full overflow-hidden rounded-lg border border-l-4 border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl shadow-black/15 backdrop-blur sm:w-[380px] dark:shadow-black/60',
        borderColors[type],
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icons[type]}</div>
        <div className="min-w-0 flex-1">
          {title && <p className="text-sm font-semibold text-foreground">{title}</p>}
          <p className={cn('break-words text-sm text-muted-foreground', title && 'mt-0.5')}>
            {message}
          </p>
        </div>
        <button
          type="button"
          onClick={() => remove(id)}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={translate('ui.dismiss')}
        >
          <X className="size-4" />
        </button>
      </div>

      {duration > 0 && (
        <motion.div
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
          className={cn('absolute inset-x-0 bottom-0 h-1 origin-left', progressColors[type])}
        />
      )}
    </motion.div>
  );
}

// Global toaster: layout.tsx içinde bir kez render edilir (sağ alt, mobilde alt kenar)
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t, index) => (
          <ToastItem key={t.id} toast={t} index={index} />
        ))}
      </AnimatePresence>
    </div>
  );
}
