import { useCallback, useMemo, useState } from 'react';

import type { FractalPoint, LineTone, OverlayLine, TradeLinkLine, TradeMarker } from '@/components/analysis/chart/ChartCore';
import { useDealsHistory } from '@/hooks/useDealsHistory';
import { useLiveTrades } from '@/hooks/useLiveTrades';
import type { MarketRates } from '@/hooks/useMarketRates';
import { useSetupLabel } from '@/hooks/useSetupLabel';
import { isCalendarTimeframe, periodStart } from '@/lib/analysis/calendarBars';
import { CHART_TIMEFRAME_SEC, type ChartData, type ChartTimeframe, isTimeframe, ratesWindow } from '@/lib/analysis/candles';
import { findFractals } from '@/lib/analysis/fractals';
import { zoneLevels, type ZoneLevels } from '@/lib/analysis/levels';
import { belongsToZoneView, pairTrades, type Trade } from '@/lib/analysis/tradePairing';
import { brokerNow } from '@/lib/serverTime';
import { setupNumbers } from '@/lib/symbolSetups';
import { useBotRuntimeStore, useSettingsStore, useWebSocketManager } from '@/store';
import type { AnalysisPrefs } from '@/store/useAnalysisPrefsStore';
import type { ZoneSettings } from '@/store/types';
import { useFormat, useT, type MessageKey } from '@/i18n';

/** MT5 ORDER_TYPE_* → Kurzname wie im Terminal */
const ORDER_TYPES: Record<number, string> = {
  0: 'BUY',
  1: 'SELL',
  2: 'BUY LIMIT',
  3: 'SELL LIMIT',
  4: 'BUY STOP',
  5: 'SELL STOP',
  6: 'BUY STOP LIMIT',
  7: 'SELL STOP LIMIT',
};
const isBuyOrder = (type: number) => type % 2 === 0;
/** Bis zu so vielen Positionen + Orders mit Beschriftung an der Preisachse */
const MAX_LABELED_TRADES = 20;
/** Bis zu so vielen Trades im Chart mit Text an den Pfeilen (Lot, Ergebnis); mehr würde sich überdecken */
const MAX_LABELED_HISTORY = 30;

function netTone(net: number): LineTone {
  if (net > 0) return 'up';
  if (net < 0) return 'down';
  return 'muted';
}

export interface SetupLayersInput {
  accountId: string;
  /** Die gewählte Zone; null = keine (dann bleiben alle Ebenen leer) */
  zone: ZoneSettings | null;
  /** Alle Zonen des Kontos (für Setup-Nummer und Setup-Bezeichnung) */
  zones: ZoneSettings[] | null;
  symbol: string | null;
  timeframe: ChartTimeframe;
  /** Gewählter Zeitraum in MT5-Sekunden, halb offen; from null = „alles“ */
  range: { from: number | null; to: number };
  offsetSec: number | null;
  clockReady: boolean;
  nowSec: () => number;
  /** Kerzen des Charts (aus useMarketRates) und die daraus gebaute Zeichnung */
  data: MarketRates | null;
  chart: ChartData | null;
  /** Kennung der aktuellen Auswahl: ein Sprung zu einem Trade gilt nur für sie */
  viewKey: string;
  prefs: AnalysisPrefs;
}

export interface LegendEntry {
  pref: keyof AnalysisPrefs;
  hint: MessageKey;
  items: { swatch: string; label: string }[];
}

export interface LegendLayer {
  pref: keyof AnalysisPrefs;
  id: string;
  label: MessageKey;
  hint: MessageKey;
  /** The switch has no effect for this setup (fractal switch of a setup without fractal entry); its hint says why */
  disabled?: boolean;
}

/**
 * Setup-Ebenen eines Charts (ANA-05/06/11): Zonenband, Stufen, Positionen und Orders des laufenden Bots,
 * Trade-Archiv mit Pfeilen und Verbindungen, Fraktale, Sprung zu einem Trade, Legende und Schalter.
 * Eingaben sind die Kerzen des Charts, das Symbol und die Zone; vom Panel hängt nichts ab.
 */
export function useSetupLayers({
  accountId,
  zone,
  zones,
  symbol,
  timeframe,
  range,
  offsetSec,
  clockReady,
  nowSec,
  data,
  chart,
  viewKey,
  prefs,
}: SetupLayersInput) {
  const t = useT();
  const tfSec = CHART_TIMEFRAME_SEC[timeframe];
  // Start of the candle that holds a time. On W1 and MN the marker sits on the period start (1107-A21.10, 1107-A4.1)
  const barStart = useCallback((time: number) => (isCalendarTimeframe(timeframe) ? periodStart(timeframe, time) : Math.floor(time / tfSec) * tfSec), [timeframe, tfSec]);

  // Live-Preis (laufende Kerze) und Positionen/Orders des laufenden Bots
  const { isConnected } = useWebSocketManager(accountId);
  useLiveTrades(accountId);
  // The page loads the symbol list; a second loading hook would clear the shared list
  const symbolDetails = useSettingsStore((s) => s.symbolDetails);
  const metrics = useBotRuntimeStore((s) => s.metrics);
  const liveData = useBotRuntimeStore((s) => s.liveData);
  const engineOrder = useSettingsStore((s) => s.engineOrder);

  // Trade-Archiv: derselbe Zeitraum wie die Kerzen (bei „alles“ bzw. gekürztem Zeitraum ab dem geladenen Beginn)
  const dealsRequest = useMemo(() => {
    if (!symbol || !clockReady) return null;
    const win = ratesWindow(range.from, range.to, tfSec);
    return { accountId, from: win.clipped || range.from === null ? win.from : range.from, to: range.to };
  }, [accountId, symbol, clockReady, range.from, range.to, tfSec]);
  const dealsLive = range.to > nowSec();
  const deals = useDealsHistory(dealsRequest, dealsLive);
  const setupLabel = useSetupLabel(zones, deals.data?.zones);
  const pairing = useMemo(
    () => (deals.data ? pairTrades(deals.data.deals, deals.data.zones, offsetSec) : null),
    [deals.data, offsetSec],
  );
  const zoneMagic = zone?.magic;
  const history = useMemo(() => {
    if (!pairing || !symbol || !dealsRequest) return null;
    // Der Worker liefert ältere Deals offener Positionen mit (für Einstiegspreis und Zone); gezeigt wird nur,
    // was im Zeitraum liegt: Trades nach Schließzeit, Einstiege nach Einstiegszeit
    const inRange = (time: number) => time >= dealsRequest.from && time < dealsRequest.to;
    const inside = pairing.trades.filter((tr) => inRange(tr.exitTime));
    const trades = inside.filter((tr) => belongsToZoneView(tr, symbol, zoneMagic));
    const entries = pairing.entries.filter((e) => inRange(e.time) && belongsToZoneView(e, symbol, zoneMagic));
    return {
      trades,
      entries,
      openEntries: entries.filter((e) => !e.closed).length,
      otherTrades: inside.length - trades.length,
    };
  }, [pairing, symbol, zoneMagic, dealsRequest]);
  const [focus, setFocus] = useState<{ time: number; seq: number; view: string } | null>(null);
  const focusTrade = useCallback(
    (tr: Trade) => {
      setFocus((f) => ({ time: barStart(tr.entryTime ?? tr.exitTime), seq: (f?.seq ?? 0) + 1, view: viewKey }));
    },
    [barStart, viewKey],
  );

  // Live-Preis nur für dieses Konto und Symbol, bei offenem Markt und sicherer Uhr
  const streamMatches = Boolean(
    symbol &&
      metrics.symbol?.toUpperCase() === symbol &&
      (!metrics.account_id || String(metrics.account_id) === accountId),
  );
  const lastClose = data && data.bars.length > 0 ? data.bars[data.bars.length - 1].close : null;
  // Zusätzliche Sicherung: ein Preis weit weg vom letzten Schlusskurs gehört zu einem anderen Symbol
  const plausible = lastClose !== null && metrics.price > 0 && Math.abs(metrics.price / lastClose - 1) < 0.2;
  const live = useMemo(
    () =>
      isConnected && streamMatches && plausible && offsetSec !== null && data?.liveFrom != null && metrics.market_open !== false
        ? { price: metrics.price, nowSec: brokerNow(offsetSec) }
        : null,
    [isConnected, streamMatches, plausible, offsetSec, data?.liveFrom, metrics.market_open, metrics.price],
  );
  // Der Stream zeigt die erste Zone des Kontos: bei anderem Symbol gehören die Live-Werte nicht zu dieser Zone
  const symbolMismatch = Boolean(symbol && metrics.symbol && metrics.symbol.toUpperCase() !== symbol);
  // Stufen gelten für den aktuellen Kurs: Live-Preis, sonst der Schluss der laufenden Kerze; bei einem
  // Zeitraum in der Vergangenheit keine Stufen (sie lägen um einen alten Kurs)
  const candleClose = data?.liveFrom != null ? lastClose : null;
  const currentPrice = streamMatches && plausible ? metrics.price : candleClose;

  const botRunning = liveData.bot_running === true;
  const positions = useMemo(
    () => (botRunning && zone ? (liveData.positions ?? []).filter((p) => p.magic === zone.magic && p.symbol.toUpperCase() === symbol) : []),
    [botRunning, zone, symbol, liveData.positions],
  );
  const orders = useMemo(
    () => (botRunning && zone ? (liveData.orders ?? []).filter((o) => o.magic === zone.magic && o.symbol.toUpperCase() === symbol) : []),
    [botRunning, zone, symbol, liveData.orders],
  );

  const pricePoint = data?.point && data.digits != null ? { point: data.point, digits: data.digits } : null;
  // Stufen ändern sich nur, wenn der Preis den Anker verschiebt: als Text vergleichen, sonst würden alle
  // Linien bei jedem Tick neu gezeichnet
  const levelsJson = JSON.stringify(zone ? zoneLevels(zone, currentPrice, positions, symbolDetails, pricePoint) : null);
  const levels = useMemo(() => JSON.parse(levelsJson) as ZoneLevels | null, [levelsJson]);

  const rawLines = useMemo<OverlayLine[]>(() => {
    if (!zone) return [];
    const out: OverlayLine[] = [];
    if (prefs.showZoneLines) {
      out.push(
        { key: 'zone-max', price: zone.max_price, title: t('chart.zone.lineMax'), tone: 'primary', style: 'dashed', axisLabel: true },
        { key: 'zone-min', price: zone.min_price, title: t('chart.zone.lineMin'), tone: 'primary', style: 'dashed', axisLabel: true },
      );
    }
    if (prefs.showLevels && levels) {
      levels.buy.forEach((p, i) => out.push({ key: `lvl-b-${i}`, price: p, title: '', tone: 'up', style: 'dotted' }));
      levels.sell.forEach((p, i) => out.push({ key: `lvl-s-${i}`, price: p, title: '', tone: 'down', style: 'dotted' }));
    }
    // Viele Positionen: Beschriftungen an der Preisachse würden sich überdecken, die Linien bleiben
    const shownTrades = (prefs.showTrades ? positions.length : 0) + (prefs.showOrders ? orders.length : 0);
    const labels = shownTrades <= MAX_LABELED_TRADES;
    if (prefs.showTrades) {
      for (const p of positions) {
        if (p.price_open === null) continue;
        const buy = p.type === 0;
        const tone = buy ? 'up' : 'down';
        out.push({ key: `pos-${p.ticket}`, price: p.price_open, title: `${buy ? 'BUY' : 'SELL'} ${p.volume ?? ''}`.trim(), tone, style: 'solid', width: 2, axisLabel: labels });
        if (p.tp > 0) out.push({ key: `pos-tp-${p.ticket}`, price: p.tp, title: 'TP', tone: 'up', style: 'dotted' });
        if (p.sl > 0) out.push({ key: `pos-sl-${p.ticket}`, price: p.sl, title: 'SL', tone: 'down', style: 'dotted' });
      }
    }
    if (prefs.showOrders) {
      for (const o of orders) {
        if (o.price_open === null) continue;
        const name = ORDER_TYPES[o.type] ?? String(o.type);
        out.push({ key: `ord-${o.ticket}`, price: o.price_open, title: `${name} ${o.volume ?? ''}`.trim(), tone: isBuyOrder(o.type) ? 'up' : 'down', style: 'dashed', axisLabel: labels });
      }
    }
    return out;
  }, [zone, levels, positions, orders, prefs.showZoneLines, prefs.showLevels, prefs.showTrades, prefs.showOrders, t]);
  // Positionen/Orders kommen alle 5 s als neue Liste: nur bei echter Änderung neu zeichnen
  const linesJson = JSON.stringify(rawLines);
  const lines = useMemo(() => JSON.parse(linesJson) as OverlayLine[], [linesJson]);

  // Trades im Chart: Pfeil am Einstieg, Punkt am Ausstieg, gepunktete Verbindung. „Zone unbekannt“ grau mit „?“
  const fmt = useFormat();
  const overlays = useMemo(() => {
    const out = { markers: [] as TradeMarker[], links: [] as TradeLinkLine[], notes: new Map<number, string[]>() };
    if (!history || !prefs.showHistory) return out;
    const bar = barStart;
    // Nur auf geladenen Kerzen: davor oder danach würde lightweight-charts den Punkt an den Rand klemmen
    const first = chart?.points[0]?.time ?? Infinity;
    const last = chart?.points[chart.points.length - 1]?.time ?? -Infinity;
    const onChart = (time: number) => bar(time) >= first && bar(time) <= last;
    const labels = history.trades.length + history.entries.length <= MAX_LABELED_HISTORY;
    const digits = data?.digits ?? undefined;
    const note = (time: number, text: string) => {
      const list = out.notes.get(time);
      if (list) list.push(text);
      else out.notes.set(time, [text]);
    };
    for (const e of history.entries) {
      if (!onChart(e.time)) continue;
      const unknown = e.zone.kind !== 'zone';
      const side = e.side === 'buy' ? 'BUY' : 'SELL';
      const vol = fmt.number(e.volume, { maximumFractionDigits: 3 });
      const sideTone = e.side === 'buy' ? 'up' : 'down';
      out.markers.push({
        key: e.id,
        time: bar(e.time),
        price: e.price,
        kind: e.side === 'buy' ? 'entryBuy' : 'entrySell',
        tone: unknown ? 'muted' : sideTone,
        text: labels ? `${unknown ? '? ' : ''}${vol}` : undefined,
      });
      note(
        bar(e.time),
        t(e.reversal ? 'analysis.trades.note.reversalEntry' : 'analysis.trades.note.entry', {
          side,
          volume: vol,
          price: fmt.price(e.price, digits),
          zone: unknown ? t('analysis.trades.unknownZone') : '',
        }).trim(),
      );
    }
    for (const tr of history.trades) {
      if (!onChart(tr.exitTime)) continue;
      const unknown = tr.zone.kind !== 'zone';
      const net = `${tr.net > 0 ? '+' : ''}${fmt.number(tr.net, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const tone = unknown ? 'muted' : netTone(tr.net);
      out.markers.push({ key: tr.id, time: bar(tr.exitTime), price: tr.exitPrice, kind: 'exit', tone, text: labels ? net : undefined });
      // Einstieg vor dem Chart: keine Verbindung (sie begänne sonst an der ersten Kerze)
      if (tr.entryTime !== null && tr.entryPrice !== null && onChart(tr.entryTime)) {
        out.links.push({
          key: tr.id,
          from: { time: bar(tr.entryTime), price: tr.entryPrice },
          to: { time: bar(tr.exitTime), price: tr.exitPrice },
          tone,
        });
      }
      note(
        bar(tr.exitTime),
        t('analysis.trades.note.exit', {
          side: tr.side === 'buy' ? 'BUY' : 'SELL',
          volume: fmt.number(tr.volume, { maximumFractionDigits: 3 }),
          price: fmt.price(tr.exitPrice, digits),
          net,
          zone: unknown ? t('analysis.trades.unknownZone') : '',
        }).trim(),
      );
    }
    return out;
  }, [history, prefs.showHistory, barStart, chart, data?.digits, fmt, t]);

  // Fraktale (nur Fraktal-Zonen) aus den geschlossenen Kerzen; die der Bot gehandelt hat, hervorgehoben
  const isFractalZone = zone?.entry_mode === 'fractal';
  const fractalTf = zone?.fractal_timeframe && isTimeframe(zone.fractal_timeframe) ? zone.fractal_timeframe : 'H4';
  const fractals = useMemo<FractalPoint[]>(() => {
    if (!isFractalZone || !prefs.showFractals || !data) return [];
    const traded = new Set(
      timeframe === fractalTf
        ? (history?.entries ?? []).filter((e) => e.fractal && e.zone.kind === 'zone').map((e) => `${e.fractal!.side}${e.fractal!.time}`)
        : [],
    );
    return findFractals(data.bars, data.missing, data.liveFrom).map((f) => ({ ...f, traded: traded.has(`${f.side}${f.time}`) }));
  }, [isFractalZone, prefs.showFractals, data, history, timeframe, fractalTf]);

  const band = zone && prefs.showZoneLines ? { min: zone.min_price, max: zone.max_price } : null;
  // Der Worker zählt nach Engine-Platz (zuletzt gespeicherte Reihenfolge), nicht nach dem Platz in `zones`
  const engineIndex = zone ? engineOrder.indexOf(zone.id) : -1;
  const marketHours = engineIndex >= 0 ? liveData.zone_market_hours?.[String(engineIndex)] : undefined;
  const isChartEmpty = Boolean(chart && data && data.bars.length === 0);

  const legend: LegendEntry[] = [
    {
      pref: 'showZoneLines',
      hint: 'analysis.settings.zoneLines.hint',
      items: [{ swatch: 'inline-block h-3 w-4 rounded-sm border-y border-dashed border-primary bg-primary/10', label: t('analysis.chart.key.band') }],
    },
    {
      pref: 'showLevels',
      hint: 'analysis.settings.levels.hint',
      items: [{ swatch: 'inline-block w-4 border-t border-dotted border-success', label: t('analysis.chart.key.levels') }],
    },
    {
      pref: 'showTrades',
      hint: 'analysis.settings.trades.hint',
      items: [{ swatch: 'inline-block w-4 border-t-2 border-success', label: t('analysis.chart.key.positions') }],
    },
    {
      pref: 'showOrders',
      hint: 'analysis.settings.orders.hint',
      items: [{ swatch: 'inline-block w-4 border-t border-dashed border-danger', label: t('analysis.chart.key.orders') }],
    },
    {
      pref: 'showHistory',
      hint: 'analysis.settings.history.hint',
      items: [
        { swatch: 'inline-block size-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-success', label: t('analysis.chart.key.entry') },
        { swatch: 'inline-block size-2 rounded-full bg-danger', label: t('analysis.chart.key.exit') },
        { swatch: 'inline-block size-2 rounded-full bg-muted-foreground', label: t('analysis.chart.key.unknown') },
      ],
    },
    ...(isFractalZone
      ? [
          {
            pref: 'showFractals' as const,
            hint: 'analysis.settings.fractals.hint' as const,
            items: [{ swatch: 'inline-block size-0 border-x-[4px] border-b-[6px] border-x-transparent border-b-primary', label: t('analysis.chart.key.fractal') }],
          },
        ]
      : []),
  ];

  // Dieselben Schalter wie die Legende, auch im Menü „Ebenen“: die Legende scrollt bei schmalen Fenstern seitlich
  const legendLayers: LegendLayer[] = [
    { pref: 'showZoneLines', id: 'zone-lines', label: 'analysis.settings.zoneLines', hint: 'analysis.settings.zoneLines.hint' },
    { pref: 'showLevels', id: 'levels', label: 'analysis.settings.levels', hint: 'analysis.settings.levels.hint' },
    { pref: 'showTrades', id: 'trades', label: 'analysis.settings.trades', hint: 'analysis.settings.trades.hint' },
    { pref: 'showOrders', id: 'orders', label: 'analysis.settings.orders', hint: 'analysis.settings.orders.hint' },
    { pref: 'showHistory', id: 'history', label: 'analysis.settings.history', hint: 'analysis.settings.history.hint' },
    { pref: 'showFractals', id: 'fractals', label: 'analysis.settings.fractals', hint: isFractalZone ? 'analysis.settings.fractals.hint' : 'analysis.settings.fractals.off.hint', disabled: !isFractalZone },
  ];

  const setupNo = zone && zones ? (setupNumbers(zones).get(zone.id) ?? 0) : 0;

  return {
    live,
    band,
    lines,
    markers: overlays.markers,
    links: overlays.links,
    notes: overlays.notes,
    fractals,
    focus: focus && focus.view === viewKey ? focus : null,
    focusTrade,
    legend,
    legendLayers,
    setupNo,
    history,
    dealsRequest,
    deals,
    setupLabel,
    levels,
    positions,
    orders,
    botRunning,
    streamMatches,
    symbolMismatch,
    streamSymbol: metrics.symbol ?? '',
    marketHours,
    isFractalZone,
    fractalTf,
    isChartEmpty,
  };
}
