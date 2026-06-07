import { Link } from 'react-router-dom';

interface DateNavigatorProps {
  date: string;
  buildPath: (date: string) => string;
}

function shiftDate(date: string, offset: number) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function formatDisplayDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DateNavigator({ date, buildPath }: DateNavigatorProps) {
  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);

  return (
    <div className="date-nav">
      <Link className="button button-secondary" to={buildPath(previous)}>
        ← Previous
      </Link>
      <div>
        <div className="section-title">Selected day</div>
        <h2>{formatDisplayDate(date)}</h2>
      </div>
      <Link className="button button-secondary" to={buildPath(next)}>
        Next →
      </Link>
    </div>
  );
}
