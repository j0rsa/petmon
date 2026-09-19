const formatters = new Map<string, Intl.DateTimeFormat>();

/** Civil snapshot for forms/calendar queries. Date-only values already stored on
 * a record are not converted through this helper. Invalid timezone config throws. */
export function resourceDateTime(now: Date, timeZone?: string): string {
  const key = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: key, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(key, formatter);
  }
  const parts = formatter.formatToParts(now);
  const value = (key: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}

export function instantOffset(instant: string, timeZone?: string): string {
  const civil = instantToCivil(instant, timeZone);
  const minutes = Math.round((Date.parse(`${civil}Z`) - Date.parse(instant)) / 60_000);
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

/** An API timestamp must identify an instant, never the browser's implicit timezone. */
export function instantToCivil(instant: string, timeZone?: string): string {
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(instant) || !Number.isFinite(Date.parse(instant))) {
    throw new Error('Expected a UTC or explicitly offset timestamp.');
  }
  return resourceDateTime(new Date(instant), timeZone);
}

/** Find every instant matching a resource-local wall clock. Zero means a DST gap;
 * two means a fold. Callers must ask the user to choose, never silently normalize. */
export function civilTimeCandidates(civil: string, timeZone: string): string[] {
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(civil) ? `${civil}:00` : civil;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return [];
  const nominal = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 19) !== normalized) return [];
  const offsets = new Set<number>();
  // Include both sides of transitions, including 30-minute DST and skipped dates.
  for (let hours = -48; hours <= 48; hours += 6) {
    const probe = nominal + hours * 3_600_000;
    offsets.add(Date.parse(`${resourceDateTime(new Date(probe), timeZone)}Z`) - probe);
  }
  return [...offsets].map((offset) => new Date(nominal - offset))
    .filter((instant) => resourceDateTime(instant, timeZone) === normalized)
    .map((instant) => instant.toISOString()).sort();
}

export function civilToInstant(civil: string, timeZone: string, choice?: string): string {
  const candidates = civilTimeCandidates(civil, timeZone);
  if (choice && candidates.includes(choice)) return choice;
  if (candidates.length === 1) return candidates[0];
  throw new Error(candidates.length === 0
    ? `This time does not exist in ${timeZone}. Choose a different time.`
    : `This time occurs twice in ${timeZone}. Choose an explicit UTC offset.`);
}
