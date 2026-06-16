import { calendarCells, formatDisplayDate, localToday, shiftMonth } from '../lib/dates';
import { formatDayHint } from '../lib/nutritionMetrics';
import type { DayNutritionHighlight } from '../types/pillars';

interface MonthCalendarProps {
  month: string;
  selectedDate: string;
  highlights: Map<string, DayNutritionHighlight>;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthCalendar({ month, selectedDate, highlights, onMonthChange, onSelectDate }: MonthCalendarProps) {
  const cells = calendarCells(month);
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
        <button className="button button-secondary button-compact calendar-nav-btn" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="calendar-weekdays">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <div key={`empty-${index}`} className="calendar-cell calendar-cell-empty" />;
          }

          const hint = formatDayHint(highlights.get(cell.date));
          const hintLines = Array.isArray(hint) ? hint : hint ? [hint] : [];
          const hasData = hintLines.length > 0;
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === localToday();

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
            </button>
          );
        })}
      </div>
      <p className="calendar-footnote muted-text">Dates show nutrition highlights. Select a day to open its log.</p>
    </section>
  );
}
