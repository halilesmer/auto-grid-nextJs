import { create } from 'zustand';
import { DEFAULT_TOAST_SECONDS, type ToastSeconds } from '@/lib/userPrefs';

/** Seçili bildirim süresi (sn; 0 = kapatılana kadar) — ayar satırı ve özet için. Toast'a etkisi `animated-toast.tsx`te (USR-11). */
export const useToastPrefsStore = create<{ seconds: ToastSeconds }>()(() => ({ seconds: DEFAULT_TOAST_SECONDS }));
export const useToastSeconds = () => useToastPrefsStore((s) => s.seconds);
