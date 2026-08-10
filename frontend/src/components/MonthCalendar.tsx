import type React from 'react';
import { useUserWidgetSettings } from '../api/userSettings';
import { calendarCells, localToday, shiftMonth } from '../lib/dates';
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

const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const today = localToday();
  const isOnToday = selectedDate === today;
  const displayMonth = new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <section className="panel calendar-panel">
      <div className="calendar-header">
        <button className="button button-secondary button-compact calendar-nav-btn" type="button" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="calendar-title">
          <p className="eyebrow">Journal</p>
          <h3>{displayMonth}</h3>
        </div>
        <div className="calendar-header-actions">
          {showSettings && (
            <WidgetSettingsGear label="Calendar display settings">
              <NutritionCalendarSettingsFields settings={settings} onChange={update} />
            </WidgetSettingsGear>
          )}
          {onGoToToday && (
            <button
              className={`button button-compact${isOnToday ? '' : ' button-secondary'}`}
              type="button"
              disabled={isOnToday}
              onClick={onGoToToday}
              style={{ opacity: isOnToday ? 0.45 : 1 }}
            >
              Today
            </button>
          )}
          <button className="button button-secondary button-compact calendar-nav-btn" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="calendar-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" />;
          }

          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === localToday();

          let hasData: boolean;
          let hintLines: string[];
          let hintExtra: React.ReactNode = null;

          if (renderDayHints) {
            const custom = renderDayHints(cell.date);
            hasData = custom.hasData;
            hintLines = custom.lines;
            hintExtra = custom.extra ?? null;
          } else {
            const highlight = highlights.get(cell.date);
            const hint = compact
              ? formatDayHintCompact(highlight, calendarConfig)
              : formatDayHint(highlight, calendarConfig);
            hintLines = Array.isArray(hint) ? hint : hint ? [hint] : [];
            hasData = hintLines.length > 0;
          }

          return (
            <button
              key={cell.date}
              type="button"
              className={`calendar-cell${hasData ? ' has-data' : ''}${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}`}
              onClick={() => onSelectDate(cell.date!)}
            >
              <span className="calendar-day">{cell.day}</span>
              {hintLines.length > 0
                ? hintLines.map((line) => <span key={line} className="calendar-hint">{line}</span>)
                : <span className="calendar-hint muted-text">—</span>
              }
              {hintExtra}
            </button>
          );
        })}
      </div>
      <p className="calendar-footnote muted-text">{footnote ?? 'Dates show nutrition highlights. Select a day to open its log.'}</p>
    </section>
  );
}
