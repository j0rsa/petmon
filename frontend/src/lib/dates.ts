export function localToday(): string {
  const now = new Date();
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function formatDisplayDate(date: string, style: 'long' | 'short' = 'long') {
  const options: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, options);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthBounds(month: string) {
  const [year, monthIndex] = month.split('-').map(Number);
  const first = `${month}-01`;
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const last = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { first, last, year, monthIndex: monthIndex - 1, lastDay };
}

export function shiftMonth(month: string, offset: number) {
  const [year, monthIndex] = month.split('-').map(Number);
  const date = new Date(year, monthIndex - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function calendarCells(month: string, weekStart: 'sunday' | 'monday' = 'sunday') {
  const { year, monthIndex, lastDay } = monthBounds(month);
  // getDay() returns 0=Sun … 6=Sat; shift by 1 when week starts on Monday
  const rawWeekday = new Date(year, monthIndex, 1).getDay();
  const firstWeekday = weekStart === 'monday' ? (rawWeekday + 6) % 7 : rawWeekday;
  const cells: Array<{ date: string | null; day: number | null }> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ date: null, day: null });
  }
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    cells.push({ date, day });
  }
  return cells;
}
