import type { CreateNutritionRecord } from '../types';

const UNIT_FOR_CATEGORY: Record<string, string> = {
  wet_food: 'g',
  dry_food: 'g',
  water: 'ml',
  liquids: 'ml',
};

/** Casual confirmation copy for a just-logged create payload set. */
export function formatLoggedNutritionMessage(payloads: CreateNutritionRecord[]): string {
  const casualLabel: Record<string, string> = {
    wet_food: 'wet',
    dry_food: 'dry',
    water: 'water',
    liquids: 'liquid',
  };
  const parts = payloads.map((p) => {
    const label = casualLabel[p.category] ?? p.category;
    const unit = p.unit ?? UNIT_FOR_CATEGORY[p.category] ?? '';
    return `${p.amount} ${unit} ${label}`.replace(/\s+/g, ' ').trim();
  });
  return `Logged ${parts.join(' + ')}`;
}
