import type { NutritionRecord } from '../types';
import { instantOffset, instantToCivil } from './resourceTime';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function exportTelegramLog(records: NutritionRecord[], timeZone?: string): string {
  if (records.length === 0) return '';

  const sorted = [...records].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  // Group by minute-level timestamp key
  const groups = new Map<string, NutritionRecord[]>();
  for (const r of sorted) {
    const key = `${instantToCivil(r.occurred_at, timeZone).slice(0, 16)}${instantOffset(r.occurred_at, timeZone)}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  const blocks: string[] = [];
  for (const [key, recs] of groups) {
    const [datePart, timePart] = key.split('T');
    const [year, mon, day] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.slice(0, 5).split(':');
    const month = MONTH_NAMES[mon - 1];

    const header = `Staging Bot, [${day}. ${month} ${year} at ${hh}:${mm}:00 ${timePart.slice(5)}]:`;
    const entries = recs.map((r) => `#cat_ate #${r.category} ${Math.round(r.amount)}`);
    blocks.push([header, ...entries].join('\n'));
  }

  return blocks.join('\n\n');
}
