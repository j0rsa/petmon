import { civilToInstant, instantToCivil } from './resourceTime';

export function nowTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}
/** Current local date and datetime with seconds, for records logged immediately. */
export function nowLocalDateTime(): { local_date: string; occurred_at: string } {
  const now = new Date();
  const local_date = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
  return { local_date, occurred_at: now.toISOString() };
}

/** Resolve a configured local clock explicitly; ambiguous/nonexistent times reject. */
export function isoFromDateAndTime(date: string, time: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  return civilToInstant(`${date}T${time}`, timeZone);
}

/** Local HH:MM in the supplied timezone from an offset/UTC instant. */
export function timeFromIso(iso: string, timeZone?: string): string {
  return instantToCivil(iso, timeZone).slice(11, 16);
}

/** Feeding windows and the reminder worker share this 10-minute grid. */
export const FEEDING_TIME_STEP_MINUTES = 10;

/** Floor `HH:MM` down to a `stepMinutes` boundary. `23:55` → `23:50`. */
export function floorHhmmToStep(time: string, stepMinutes = FEEDING_TIME_STEP_MINUTES): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match || stepMinutes <= 0) return time;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time;
  const total = hours * 60 + minutes;
  const floored = Math.floor(total / stepMinutes) * stepMinutes;
  const h = Math.floor(floored / 60);
  const m = floored % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
