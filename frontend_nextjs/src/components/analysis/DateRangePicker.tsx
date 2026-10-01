'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { de, enUS, tr } from 'date-fns/locale';
import 'react-day-picker/style.css';
import { Button } from '@/components/ui/button';
import { DropdownMenu, useDropdownClose } from '@/components/ui/dropdown-menu';
import { InputField } from '@/components/ui/InputField';
import { InfoHint } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLocale, useT, type MessageKey } from '@/i18n';
import {
  RANGE_PRESETS,
  dayToPickerDate,
  formatDayInput,
  parseDayInput,
  pickerDateToDay,
  presetRange,
  type DayRange,
  type DayString,
  type RangePreset,
} from '@/lib/serverTime';
import type { RangeSelection } from '@/hooks/useAnalysisParams';

const PRESET_KEYS: Record<RangePreset, MessageKey> = {
  today: 'analysis.range.preset.today',
  thisWeek: 'analysis.range.preset.thisWeek',
  thisMonth: 'analysis.range.preset.thisMonth',
  lastMonth: 'analysis.range.preset.lastMonth',
  last7: 'analysis.range.preset.last7',
  last30: 'analysis.range.preset.last30',
  last90: 'analysis.range.preset.last90',
  thisYear: 'analysis.range.preset.thisYear',
  lastYear: 'analysis.range.preset.lastYear',
  last12Months: 'analysis.range.preset.last12Months',
  all: 'analysis.range.preset.all',
};

const DATE_FNS_LOCALES = { tr, en: enUS, de };

/** Tage eines gewählten Zeitraums (Vorauswahl relativ zu `today` aufgelöst). */
export function resolveRange(selection: RangeSelection, today: DayString): DayRange {
  return 'preset' in selection ? presetRange(selection.preset, today) : selection.custom;
}

function rangeText(range: DayRange, allLabel: string) {
  return range.from && range.to ? `${formatDayInput(range.from)} – ${formatDayInput(range.to)}` : allLabel;
}

interface DateRangePickerProps {
  value: RangeSelection;
  /** Heutiger Brokertag (Brokeruhr des Kontos) */
  today: DayString;
  onChange: (value: RangeSelection) => void;
}

/**
 * Zeitraum in Brokertagen (MT5-Zeit): Vorauswahlen, Kalender und Eingabe als TT.MM.JJ.
 * Gerechnet wird in src/lib/serverTime.ts; der Kalender zeigt nur Tage an.
 */
export function DateRangePicker({ value, today, onChange }: DateRangePickerProps) {
  const t = useT();
  const range = resolveRange(value, today);
  const label = 'preset' in value ? t(PRESET_KEYS[value.preset]) : rangeText(range, t('analysis.range.all'));
  const detail = 'preset' in value && value.preset !== 'all' ? rangeText(range, '') : null;

  return (
    <DropdownMenu
      label={`${t('analysis.range')}: ${label}`}
      hint={t('analysis.range.hint')}
      icon={
        <span className="flex min-w-0 items-center gap-2" data-testid="range-trigger">
          <CalendarDays size={14} className="shrink-0" />
          <span className="truncate">{label}</span>
          {detail && <span className="hidden truncate text-xs font-normal text-muted-foreground sm:inline">{detail}</span>}
        </span>
      }
      size="sm"
      align="left"
      className="min-w-0 max-w-full"
      panelClassName="w-[min(calc(100vw-2rem),36rem)]"
    >
      <RangePanel value={value} range={range} today={today} onChange={onChange} />
    </DropdownMenu>
  );
}

function RangePanel({
  value,
  range,
  today,
  onChange,
}: {
  value: RangeSelection;
  range: DayRange;
  today: DayString;
  onChange: (value: RangeSelection) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const close = useDropdownClose();
  const [fromText, setFromText] = useState(range.from ? formatDayInput(range.from) : '');
  const [toText, setToText] = useState(range.to ? formatDayInput(range.to) : '');

  const from = parseDayInput(fromText);
  const to = parseDayInput(toText);
  const fromError = fromText && !from ? t('analysis.range.invalid') : null;
  const toError = toText && !to ? t('analysis.range.invalid') : null;
  const orderError = from && to && from > to ? t('analysis.range.order') : null;
  const canApply = Boolean(from && to && !orderError);

  const selected = useMemo<DateRange | undefined>(
    () => (from ? { from: dayToPickerDate(from), to: to ? dayToPickerDate(to) : undefined } : undefined),
    [from, to],
  );

  const choose = (selection: RangeSelection) => {
    onChange(selection);
    close();
  };

  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row" data-testid="range-panel">
      <div className="grid grid-cols-2 gap-1 sm:w-40 sm:grid-cols-1" role="group" aria-label={t('analysis.range')}>
        {RANGE_PRESETS.map((preset) => {
          const presetLabel = t(PRESET_KEYS[preset]);
          const active = 'preset' in value && value.preset === preset;
          return (
            <Button
              key={preset}
              size="sm"
              variant={active ? 'primary' : 'ghost'}
              className="justify-start"
              hint={t('analysis.range.preset.hint', { label: presetLabel })}
              aria-pressed={active}
              data-testid={`range-preset-${preset}`}
              onClick={() => choose({ preset })}
            >
              {presetLabel}
            </Button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 space-y-3 border-t border-border pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
        <div data-tooltip-scope className="relative">
          <InfoHint hint={t('analysis.range.calendar.hint')} className="absolute right-1 top-1 z-10" />
          <DayPicker
            mode="range"
            locale={DATE_FNS_LOCALES[locale]}
            weekStartsOn={1}
            selected={selected}
            defaultMonth={dayToPickerDate(to ?? from ?? today)}
            disabled={{ after: dayToPickerDate(today) }}
            onSelect={(next) => {
              setFromText(next?.from ? formatDayInput(pickerDateToDay(next.from)) : '');
              setToText(next?.to ? formatDayInput(pickerDateToDay(next.to)) : '');
            }}
            className="text-sm"
            style={
              {
                '--rdp-accent-color': 'var(--primary)',
                '--rdp-accent-background-color': 'color-mix(in oklab, var(--primary) 15%, transparent)',
                '--rdp-day-height': '2.1rem',
                '--rdp-day-width': '2.1rem',
                '--rdp-day_button-height': '2rem',
                '--rdp-day_button-width': '2rem',
              } as CSSProperties
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InputField
            label={t('analysis.range.from')}
            hint={t('analysis.range.from.hint')}
            error={fromError && <span className="text-xs text-danger" role="alert">{fromError}</span>}
          >
            <input
              className={cn('input-s', fromError && 'border-danger')}
              aria-invalid={Boolean(fromError)}
              value={fromText}
              onChange={(e) => setFromText(e.target.value)}
              placeholder={t('analysis.range.format')}
              inputMode="numeric"
              data-testid="range-from"
            />
          </InputField>
          <InputField
            label={t('analysis.range.to')}
            hint={t('analysis.range.to.hint')}
            error={(toError ?? orderError) && <span className="text-xs text-danger" role="alert">{toError ?? orderError}</span>}
          >
            <input
              className={cn('input-s', (toError ?? orderError) && 'border-danger')}
              aria-invalid={Boolean(toError ?? orderError)}
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              placeholder={t('analysis.range.format')}
              inputMode="numeric"
              data-testid="range-to"
            />
          </InputField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t('analysis.range.brokerTime')}</span>
          <Button
            size="sm"
            variant="primary"
            disabled={!canApply}
            hint={canApply ? t('analysis.range.apply.hint') : t('analysis.range.apply.off.hint')}
            data-testid="range-apply"
            onClick={() => from && to && choose({ custom: { from, to } })}
          >
            {t('analysis.range.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
