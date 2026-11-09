'use client';

import type { ReactNode } from 'react';

import { DockAnchor } from '@/components/chart-workspace/dock/DockAnchor';
import { DockPackage } from '@/components/chart-workspace/dock/DockPackage';
import { useDock } from '@/components/chart-workspace/dock/DockProvider';
import { DockRow } from '@/components/chart-workspace/dock/DockRow';
import { cn } from '@/lib/utils';

/** Was die Seite /chart zur Kopfleiste und zu den Hinweisen der Chart-Ansicht beisteuert (Konto, Zeitraum) */
export interface ChartChrome {
  account: ReactNode;
  range: ReactNode;
  /** Hinweise der Seite (Brokeruhr, Ladefehler) */
  notices: ReactNode;
}

/** Die Teile der Kopfleiste einer Chartseite; jeder steht in einem eigenen Platz (`Slot`), damit er auf dem Handy umsortiert werden kann */
export interface ChartTopBarProps {
  account: ReactNode;
  /** Symbol (frei) oder Setup (Setup-Modus) */
  target: ReactNode;
  timeframes: ReactNode;
  /** Formation buttons of the one chart (package `formations`, second row) */
  forms?: ReactNode;
  range: ReactNode;
  /** Knöpfe am Ende (Lizenzhinweis, Anzeige-Schalter) */
  tools: ReactNode;
  /** Statistik-Seite: kein Platz für die Werkzeugleiste rechts (sie gibt es dort nicht) */
  flat?: boolean;
}

/**
 * Platz eines Teils der Kopfleiste. Ab 30 rem Containerbreite ist er unsichtbar (`contents`), die Teile liegen wie früher in ihren
 * Gruppen. Auf dem Handy (Container unter 30 rem; die Messung steht im Journal 2026-11-03-chart-topbar-compact.md) wird er ein Block mit
 * Reihenfolge und Breite. Die Klassen stehen ausgeschrieben, damit Tailwind sie findet.
 */
function Slot({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('contents @max-[30rem]/formation-main:block @max-[30rem]/formation-main:min-w-0', className)}>{children}</div>;
}

/**
 * Kopfleiste einer Chartseite im Stil vom Modus Formation von /chart. Ab 30 rem Containerbreite stehen Konto, Modus und Ziel (Symbol bzw. Setup),
 * Zeiteinheiten sowie Zeitraum und Knöpfe in einer umbrechenden Zeile, `extra` (Legenden-Schalter) in der Zeile darunter.
 * Auf dem Handy (unter 30 rem, Handy-Entwurf „Ein Chart · 03.11.“) stehen sie in drei Zeilen:
 * Konto und Ziel (das Ziel hat Inhaltsbreite, höchstens 42 %, das Konto den Rest, Variante C von 04.11.); Zeitraum und Knöpfe; Zeiteinheiten.
 * Ab lg liegt die Leiste über dem Chart (ChartPage); am Ende steht die `DockRow` von Zeile 1 (UI-17, Pakete der Werkzeuge; gibt es keine, ist sie ausgeblendet). Die Leiste reicht Klicks im freien Bereich durch (nur ihre Bedienelemente fangen sie).
 */
export function ChartTopBar({ account, target, timeframes, forms, range, tools, flat = false }: ChartTopBarProps) {
  const dock = useDock();
  // Paketler 30 rem Containerbreite an (Plan 1106-A1.5); darunter und ohne Provider (Statistik) die feste Anordnung wie bisher
  const docked = !!dock && !dock.phone && !flat;
  if (docked) {
    // UI-17, S4 (plan 1106-A4.1): Satır 1 = Ürün · Hesap (sabit) · Aksiyonlar + diğer paketler; tek DockRow. Aksiyonlar paketi Zeitraum
    // ve araç düğmelerini taşır (plan 1106-A4.10: data-keep yok; ok menüsüne giriş sırası araçlar, Zeitraum; Chart/Statistik seit UI-23 nicht mehr; Zeitraum ilk düğme olduğu için satırda kalır, dar kapsayıcıda tarih aralığı gizlenir). Satır 2 yalnız Zaman dilimleri (TimeframeSelect) paketi içindir ve boşsa gizlidir.
    return (
      <div className="pointer-events-none bg-background short:[&_button]:max-h-7 short:[&_input]:max-h-7" data-testid="chart-topbar">
        <div className="flex min-h-[38px] min-w-0 items-center border-b border-border px-2 short:min-h-0" data-testid="chart-topbar-row1">
          <DockRow zone="row1" className="min-h-[38px] short:min-h-7" />
        </div>
        {/* Querformat-Handy (short, plan 1106-A4.4): die Höhe wächst nicht */}
        <div className="short:flex short:min-w-0 short:items-center short:border-b short:border-border">
          <DockRow zone="row2" className="w-full flex-none rounded-none border-b border-border px-2 short:w-auto short:border-b-0" />
        </div>
        {target && <DockPackage id="symbol"><div className="w-44 min-w-0 max-w-full [&_[data-testid=zone-select]]:w-full [&_[data-testid=zone-select]]:flex-1" data-keep="">{target}</div></DockPackage>}
        <DockAnchor className="px-1">{account}</DockAnchor>
        <DockPackage id="actions">
          <div className="flex items-center @max-[75rem]/formation-main:[&_[data-range-detail]]:hidden">{range}</div>
          {tools}
        </DockPackage>
        {timeframes && <DockPackage id="timeframes"><div className="flex items-center" data-keep="">{timeframes}</div></DockPackage>}
        {forms && <DockPackage id="formations" testId="formation-forms">{forms}</DockPackage>}
      </div>
    );
  }
  return (
    <div className="pointer-events-none bg-background short:grid short:grid-cols-[max-content_max-content_minmax(0,1fr)] short:[&_[aria-haspopup]]:max-h-7 short:[&_input]:max-h-7 short:border-b short:border-border" data-testid="chart-topbar">
      <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1 short:contents', '@max-[30rem]/formation-main:gap-x-1')}>
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 max-lg:w-full short:col-span-3 short:w-auto short:flex-nowrap short:border-b short:border-border short:px-2 short:py-0.5', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-1 @max-[30rem]/formation-main:flex-1 @max-[30rem]/formation-main:basis-[56%]">{account}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-2 @max-[30rem]/formation-main:flex-[0_1_auto] @max-[30rem]/formation-main:max-w-[42%]">{target}</Slot>
        </div>
        {/* The DOM follows the order on the phone (tab order = visual order, UI-15): range and tools, then timeframes and formations */}
        <div className={cn('pointer-events-auto flex min-w-0 flex-wrap items-center gap-1 short:flex-nowrap short:px-2 short:py-0', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-4 @max-[30rem]/formation-main:flex-1">{range}</Slot>
          <Slot className="@max-[30rem]/formation-main:order-5 @max-[30rem]/formation-main:flex @max-[30rem]/formation-main:gap-1">{tools}</Slot>
        </div>
        <div className={cn('pointer-events-auto flex min-w-0 max-w-full items-center gap-1 short:px-2 short:py-0', '@max-[30rem]/formation-main:contents')}>
          <Slot className="@max-[30rem]/formation-main:order-6 @max-[30rem]/formation-main:basis-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:w-full @max-[30rem]/formation-main:[&>[data-testid=timeframe-select]]:justify-between">{timeframes}</Slot>
          {forms && <Slot className="@max-[30rem]/formation-main:order-6 @max-[30rem]/formation-main:basis-full"><div className="pointer-events-auto flex h-[30px] min-w-0 items-center gap-0.5 overflow-x-auto" data-testid="formation-forms">{forms}</div></Slot>}
        </div>
        {/* Satır 1'in paket bölgesi (UI-17): başlıkta kalan genişlik; paket yokken gizli */}
        {!flat && <DockRow zone="row1" className="short:col-span-3 @max-[30rem]/formation-main:hidden" />}
      </div>
    </div>
  );
}
