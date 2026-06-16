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
        <button className="button button-secondary button-compact" type="button" onClick={() => onMonthChange(shiftMonth(month, -1))}>
          ←
        </button>
        <div className="calendar-title">
          <p className="eyebrow">Journal</p>
          <h3>{displayMonth}</h3>
        </div>
        <button className="button button-secondary button-compact" type="button" onClick={() => onMonthChange(shiftMonth(month, 1))}>
          →
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
          const hasData = Boolean(hint);
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
              {hint ? <span className="calendar-hint">{hint}</span> : <span className="calendar-hint muted-text">—</span>}
            </button>
          );
        })}
      </div>
      <p className="calendar-footnote muted-text">Dates show nutrition highlights. Select a day to open its log.</p>
    </section>
  );
}
