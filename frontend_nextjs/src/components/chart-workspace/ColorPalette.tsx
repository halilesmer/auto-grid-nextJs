'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu } from '@/components/ui/dropdown-menu';
import { Tooltip } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { joinColor, splitColor } from '@/lib/chart-workspace/fibStyle';
import { cn } from '@/lib/utils';
import { useCustomColorsStore } from '@/store/useCustomColorsStore';
import { NumberBox } from './indicatorControls';

/** Gri sırası ve ana renkler (TradingView paleti), 10 sütun */
const MAIN = [
  '#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#2a2e39', '#131722', '#000000',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63',
];
/** Ana renklerin tonları: açıktan koyuya altı sıra */
const SHADES = [
  '#fccbcd', '#ffe0b2', '#fff9c4', '#c8e6c9', '#ace5dc', '#b2ebf2', '#bbd9fb', '#d1c4e9', '#e1bee7', '#f8bbd0',
  '#faa1a4', '#ffcc80', '#fff59d', '#a5d6a7', '#70ccbd', '#80deea', '#90bff9', '#b39ddb', '#ce93d8', '#f48fb1',
  '#f77c80', '#ffb74d', '#fff176', '#81c784', '#42bda8', '#4dd0e1', '#5b9cf6', '#9575cd', '#ba68c8', '#f06292',
  '#f7525f', '#ffa726', '#ffee58', '#66bb6a', '#22ab94', '#26c6da', '#3179f5', '#7e57c2', '#ab47bc', '#ec407a',
  '#b22833', '#f57c00', '#f9a825', '#388e3c', '#056656', '#0097a7', '#1848cc', '#512da8', '#7b1fa2', '#c2185b',
  '#801922', '#e65100', '#f57f17', '#1b5e20', '#00332a', '#006064', '#0c3299', '#311b92', '#4a148c', '#880e4f',
];
export const PALETTE_COLORS = [...MAIN, ...SHADES];
const CHECKER = 'repeating-conic-gradient(#9a9a9a 0 25%, #fff 0 50%) 0 0 / 8px 8px';
const MIXED = 'linear-gradient(135deg, #089981 50%, #f23645 50%)';

export interface ColorPaletteProps {
  /** Tetikleyicinin adı (aria-label) */
  label: string;
  hint: string;
  /** Opaklık kutusunun adı ve açıklaması */
  alphaLabel: string;
  alphaHint: string;
  /** `#rrggbb` ya da `#rrggbbaa` */
  value: string;
  /** Renk seçilince: yeni renk mevcut opaklıkla (`#rrggbbaa`) */
  onChange: (value: string) => void;
  /** Opaklık değişince; yoksa `onChange(joinColor(rgb, alpha))` */
  onAlpha?: (alpha: number) => void;
  /** Birden çok renk temsil ediliyor (Tek renk kullan): tetikleyici iki renkli görünür */
  mixed?: boolean;
  testId?: string;
  /** Panelin altında ek alan (ör. seviye metni) */
  children?: ReactNode;
}

/** Renk kutusu + TradingView gibi renk paneli: palet, „+“ ile özel renk, opaklık. */
export function ColorPalette({ label, hint, alphaLabel, alphaHint, value, onChange, onAlpha, mixed = false, testId, children }: ColorPaletteProps) {
  // Üretim derlemesi renkleri kısaltır (#ffffff → #fff); splitColor uzun biçime çevirir
  const { rgb, alpha } = splitColor(value), shown = joinColor(rgb, alpha);
  const setAlpha = (a: number) => (onAlpha ? onAlpha(a) : onChange(joinColor(rgb, a)));
  return <DropdownMenu floating label={label} hint={hint} size="icon-sm" align="left"
    triggerProps={{ ...(testId ? { 'data-testid': testId } : {}), className: 'size-8 shrink-0 rounded-md border-muted-foreground/50 p-1' }}
    panelClassName="w-[260px] max-w-[calc(100vw-1rem)] p-3"
    icon={<span className="block size-full rounded-sm border border-black/20" style={{ background: mixed ? MIXED : `linear-gradient(${shown}, ${shown}), ${CHECKER}` }} aria-hidden="true" />}>
    <PalettePanel rgb={mixed ? '' : rgb} alpha={alpha} alphaLabel={alphaLabel} alphaHint={alphaHint} onPick={c => onChange(joinColor(c, alpha))} onAlpha={setAlpha}>{children}</PalettePanel>
  </DropdownMenu>;
}

function PalettePanel({ rgb, alpha, alphaLabel, alphaHint, onPick, onAlpha, children }: { rgb: string; alpha: number; alphaLabel: string; alphaHint: string; onPick: (c: string) => void; onAlpha: (a: number) => void; children?: ReactNode }) {
  const t = useT();
  const customs = useCustomColorsStore(s => s.colors);
  const addColor = useCustomColorsStore(s => s.addColor);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { void useCustomColorsStore.persist.rehydrate(); }, []);
  // `input` her kaydırmada gelir (canlı önizleme); listeye yalnız seçici kapanınca (`change`) eklenir
  useEffect(() => {
    const el = picker.current;
    if (!el) return;
    const onDone = () => addColor(el.value);
    el.addEventListener('change', onDone);
    return () => el.removeEventListener('change', onDone);
  }, [addColor]);
  const swatch = (c: string) => <Button key={c} size="icon-xs" variant="ghost" data-testid="palette-swatch" data-color={c}
    className={cn('size-5 rounded-[3px] border border-black/15 p-0 hover:scale-110 dark:border-white/15', c === rgb && 'ring-2 ring-foreground ring-offset-1 ring-offset-popover')}
    style={{ background: c }} aria-label={t('fib.palette.swatch', { color: c })} aria-pressed={c === rgb} hint={t('fib.palette.swatch.hint', { color: c })} onClick={() => onPick(c)} />;
  return <div className="grid gap-3" data-testid="color-palette">
    <div className="grid gap-2">
      <div className="grid grid-cols-10 gap-1">{MAIN.map(swatch)}</div>
      <div className="grid grid-cols-10 gap-1">{SHADES.map(swatch)}</div>
    </div>
    <div className="grid grid-cols-10 gap-1 border-t border-border pt-3">
      <Tooltip content={t('fib.palette.custom.hint')}>
        <span className="relative flex size-5 items-center justify-center rounded-[3px] border border-border text-muted-foreground hover:text-foreground focus-within:ring-2 focus-within:ring-ring">
          <Plus className="size-3.5" aria-hidden="true" />
          <input ref={picker} type="color" aria-label={t('fib.palette.custom')} data-testid="palette-custom" className="absolute inset-0 size-full cursor-pointer opacity-0" value={rgb || '#808080'} onChange={e => onPick(e.target.value)} />
        </span>
      </Tooltip>
      {customs.map(swatch)}
    </div>
    <div className="flex items-center gap-2 border-t border-border pt-3">
      <Tooltip content={alphaHint} className="min-w-0 flex-1">
        <input type="range" min={0} max={100} aria-label={t('fib.palette.alphaSlider', { name: alphaLabel })} data-testid="palette-alpha-slider" className="h-6 w-full accent-foreground" style={{ background: 'transparent' }} value={alpha} onChange={e => onAlpha(Number(e.target.value))} />
      </Tooltip>
      <span className="inline-flex shrink-0 items-center gap-1">
        <NumberBox label={alphaLabel} hint={alphaHint} className="h-8 w-16 spin-on-hover" value={alpha} min={0} max={100} onChange={onAlpha} />
        <span className="text-xs text-muted-foreground" aria-hidden="true">%</span>
      </span>
    </div>
    {children && <div className="border-t border-border pt-3">{children}</div>}
  </div>;
}
