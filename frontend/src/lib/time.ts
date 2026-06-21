export function nowTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

/** Combine a YYYY-MM-DD date and HH:MM time into a naive local ISO datetime. */
export function isoFromDateAndTime(date: string, time: string): string {
  return `${date}T${time}:00`;
}

/** Extract HH:MM from a naive ISO datetime string. */
export function timeFromIso(iso: string): string {
  return iso.slice(11, 16);
}
