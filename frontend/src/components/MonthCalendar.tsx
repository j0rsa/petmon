import { useTime } from '../context/useTime';
import type React from 'react';
import { useUserWidgetSettings } from '../api/userSettings';
import { calendarCells, formatMonthHeading, shiftMonth } from '../lib/dates';
import { formatDayHint, formatDayHintCompact } from '../lib/nutritionMetrics';
import { nutritionCalendarToDisplayConfig, weekStartFromSettings } from '../lib/widgetSettings';
import type { DayNutritionHighlight } from '../types/pillars';
import { NutritionCalendarSettingsFields } from './NutritionCalendarSettingsFields';
import { WidgetSettingsGear } from './WidgetSettingsGear';

interface MonthCalendarProps {
  month: string;
  selectedDate: string;
  highlights: Map<string, DayNutritionHighlight>;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  onGoToToday?: () => void;
  compact?: boolean;
  /** Optional override: render custom hint content for a given date cell. */
  renderDayHints?: (date: string) => { hasData: boolean; lines: string[]; extra?: React.ReactNode };
  footnote?: string;
  /** When false, calendar widget settings gear is hidden (e.g. elimination journal). */
  showSettings?: boolean;
}

const WEEKDAYS_SUN = [
  { full: 'Sun', short: 'S' },
  { full: 'Mon', short: 'M' },
  { full: 'Tue', short: 'T' },
  { full: 'Wed', short: 'W' },
  { full: 'Thu', short: 'T' },
  { full: 'Fri', short: 'F' },
  { full: 'Sat', short: 'S' },
] as const;
const WEEKDAYS_MON = [
  { full: 'Mon', short: 'M' },
  { full: 'Tue', short: 'T' },
  { full: 'Wed', short: 'W' },
  { full: 'Thu', short: 'T' },
  { full: 'Fri', short: 'F' },
  { full: 'Sat', short: 'S' },
  { full: 'Sun', short: 'S' },
] as const;

export function MonthCalendar({
  month,
  selectedDate,
  highlights,
  onMonthChange,
  onSelectDate,
  onGoToToday,
  compact = false,
  renderDayHints,
  footnote,
  showSettings = true,
}: MonthCalendarProps) {
  const { settings, update } = useUserWidgetSettings('nutrition_calendar');
  const weekStart = weekStartFromSettings(settings);
  const calendarConfig = nutritionCalendarToDisplayConfig(settings);
  const cells = calendarCells(month, weekStart);
  const weekdays = weekStart === 'monday' ? WEEKDAYS_MON : WEEKDAYS_SUN;
  const { today } = useTime();
  const isOnToday = selectedDate === today;
  const displayMonthLong = formatMonthHeading(month, 'long');
  const displayMonthShort = formatMonthHeading(month, 'short');

  return (
    <section className={`panel calendar-panel${compact ? ' calendar-panel--compact' : ''}`}>
      <div className="calendar-header">
        <div className="calendar-title">
          <p className="eyebrow">Journal</p>
          <h3>
            <span className="calendar-month calendar-month--long">{displayMonthLong}</span>
            <span className="calendar-month calendar-month--short">{displayMonthShort}</span>
          </h3>
        </div>
        {showSettings && (
          <div className="calendar-header-actions">
            <WidgetSettingsGear label="Calendar display settings">
              <NutritionCalendarSettingsFields settings={settings} onChange={update} />
            </WidgetSettingsGear>
          </div>
        )}
      </div>
      <div className="calendar-toolbar">
        <button className="button button-secondary button-compact calendar-nav-btn" type="button" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {onGoToToday ? (
          <button
            className={`button button-compact${isOnToday ? '' : ' button-secondary'}`}
            type="button"
            disabled={isOnToday}
            onClick={onGoToToday}
            style={{ opacity: isOnToday ? 0.45 : 1 }}
          >
            Today
          </button>
        ) : (
          <span className="calendar-toolbar-spacer" />
        )}
        <button className="button button-secondary button-compact calendar-nav-btn" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="calendar-weekdays">
        {weekdays.map((day, index) => (
          <span key={`${day.full}-${index}`} aria-label={day.full}>
            <span className="calendar-weekday-full">{day.full}</span>
            <span className="calendar-weekday-short" aria-hidden="true">{day.short}</span>
          </span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" />;
          }

          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === today;

          let hasData: boolean;
          let hintNodes: React.ReactNode;
          let hintExtra: React.ReactNode = null;

          if (renderDayHints) {
            const custom = renderDayHints(cell.date);
            hasData = custom.hasData;
            hintExtra = custom.extra ?? null;
            hintNodes = custom.lines.length > 0
              ? custom.lines.map((line) => <span key={line} className="calendar-hint">{line}</span>)
              : <span className="calendar-hint muted-text">—</span>;
          } else {
            const highlight = highlights.get(cell.date);
            const hintLines = compact
              ? formatDayHintCompact(highlight, calendarConfig)
              : formatDayHint(highlight, calendarConfig);
            hasData = hintLines.length > 0;
            hintNodes = hintLines.length > 0
              ? hintLines.map((line) => (
                  <span
                    key={line.kind}
                    className={`calendar-hint calendar-hint--${line.kind}`}
                    title={line.title}
                  >
                    {line.text}
                  </span>
                ))
              : <span className="calendar-hint muted-text">—</span>;
          }

          return (
            <button
              key={cell.date}
              type="button"
              className={`calendar-cell${hasData ? ' has-data' : ''}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onSelectDate(cell.date!)}
            >
              <span className="calendar-day">{cell.day}</span>
              {hintNodes}
              {hintExtra}
            </button>
          );
        })}
      </div>
      <p className="calendar-footnote muted-text">{footnote ?? 'Dates show nutrition highlights. Select a day to open its log.'}</p>
    </section>
  );
}
