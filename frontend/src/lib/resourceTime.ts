/** Civil snapshot for forms/calendar queries. Date-only values already stored on
 * a record are not converted through this helper. Invalid timezone config throws. */
export function resourceDateTime(now: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (key: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}
