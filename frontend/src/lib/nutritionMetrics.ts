import type { DayNutritionHighlight } from '../types/pillars';
import type { NutritionDailyTotal, NutritionDaySummary } from '../types';

const WET_FOOD_FLUID_RATIO = 0.77;

export function emptyHighlight(): DayNutritionHighlight {
  return { recordCount: 0, wetFood: 0, water: 0, liquids: 0, dryFood: 0 };
}

export function aggregateDailyHighlights(totals: NutritionDailyTotal[]): Map<string, DayNutritionHighlight> {
  const map = new Map<string, DayNutritionHighlight>();

  for (const total of totals) {
    const current = map.get(total.local_date) ?? emptyHighlight();
    current.recordCount += total.record_count;
    if (total.category === 'wet_food') current.wetFood += total.total_amount;
    if (total.category === 'water') current.water += total.total_amount;
    if (total.category === 'liquids') current.liquids += total.total_amount;
    if (total.category === 'dry_food') current.dryFood += total.total_amount;
    map.set(total.local_date, current);
  }

  return map;
}

export function highlightFromSummary(summary: NutritionDaySummary): DayNutritionHighlight {
  const highlight = emptyHighlight();
  highlight.recordCount = summary.records.length;
  for (const [category, amount] of Object.entries(summary.totals_by_category)) {
    if (category === 'wet_food') highlight.wetFood = amount;
    if (category === 'water') highlight.water = amount;
    if (category === 'liquids') highlight.liquids = amount;
    if (category === 'dry_food') highlight.dryFood = amount;
  }
  return highlight;
}

export function totalKnownFluidMl(highlight: DayNutritionHighlight) {
  const fromFood = Math.round(highlight.wetFood * WET_FOOD_FLUID_RATIO);
  return fromFood + highlight.water + highlight.liquids;
}

export function formatDayHint(highlight: DayNutritionHighlight | undefined) {
  if (!highlight || highlight.recordCount === 0) return '';
  const parts: string[] = [];
  if (highlight.wetFood > 0) parts.push(`${Math.round(highlight.wetFood)}g wet`);
  if (highlight.liquids > 0) parts.push(`${Math.round(highlight.liquids)}ml liq`);
  if (highlight.water > 0) parts.push(`${Math.round(highlight.water)}ml water`);
  if (highlight.dryFood > 0) parts.push(`${Math.round(highlight.dryFood)}g dry`);
  if (parts.length === 0) return `${highlight.recordCount} log${highlight.recordCount === 1 ? '' : 's'}`;
  return parts;
}

export type DayHint = ReturnType<typeof formatDayHint>;
