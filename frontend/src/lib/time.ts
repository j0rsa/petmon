export function nowTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}
/** Current local date and datetime with seconds, for records logged immediately. */
export function nowLocalDateTime(): { local_date: string; occurred_at: string } {
  const now = new Date();
  const local_date = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  return { local_date, occurred_at: `${local_date}T${time}` };
}

/** Combine a YYYY-MM-DD date and HH:MM time into a naive local ISO datetime. */
export function isoFromDateAndTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/** Extract HH:MM from a naive ISO datetime string. */
export function timeFromIso(iso: string): string {
  return iso.slice(11, 16);
}
