import type { CreateNutritionRecord } from '../types';

const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export interface ParsedNutritionEntry {
  local_date: string;
  time: string;
  category: string;
  amount: number;
  unit: string;
}

/** Parse Telegram bot nutrition logs (ported from cat-intake-tracker_8.html). */
export function parseTelegramNutritionLog(raw: string): ParsedNutritionEntry[] {
  const timeRe = /\[(\d+)\.\s*(\w+)\s+(\d+)\s+at\s+(\d+):(\d+):(\d+)\]/;
  const entryRe = /#cat_ate\s+#(\w+)\s+(\d+)/g;
  const blocks = raw.split(/(?=Staging Bot,)/g).filter((block) => block.trim());
  const result: ParsedNutritionEntry[] = [];

  for (const block of blocks) {
    const tm = block.match(timeRe);
    if (!tm) continue;

    const mon = MONTH_MAP[tm[2].toLowerCase().slice(0, 3)] ?? 0;
    const year = parseInt(tm[3], 10);
    const day = parseInt(tm[1], 10);
    const hh = tm[4].padStart(2, '0');
    const mm = tm[5].padStart(2, '0');
    const localDate = `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    entryRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = entryRe.exec(block)) !== null) {
      const type = match[1].toLowerCase();
      const amount = parseInt(match[2], 10);
      if (type !== 'liquids' && type !== 'wet_food') continue;

      result.push({
        local_date: localDate,
        time: `${hh}:${mm}`,
        category: type === 'liquids' ? 'water' : 'wet_food',
        amount,
        unit: type === 'liquids' ? 'ml' : 'g',
      });
    }
  }

  return result;
}

export function toCreateNutritionRecords(entries: ParsedNutritionEntry[], petId: string): CreateNutritionRecord[] {
  return entries.map((entry) => ({
    pet_id: petId,
    occurred_at: `${entry.local_date}T${entry.time}:00Z`,
    local_date: entry.local_date,
    category: entry.category,
    amount: entry.amount,
    unit: entry.unit,
    source_type: 'telegram',
  }));
}

export function dedupeCreateRecords(records: CreateNutritionRecord[]): CreateNutritionRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.pet_id}|${record.occurred_at}|${record.category}|${record.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
