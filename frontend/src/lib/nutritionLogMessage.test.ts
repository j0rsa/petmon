import { describe, expect, it } from 'vitest';
import { formatLoggedNutritionMessage } from './nutritionLogMessage';
import type { CreateNutritionRecord } from '../types';

describe('formatLoggedNutritionMessage', () => {
  it('formats a wet + liquid pair casually', () => {
    const payloads: CreateNutritionRecord[] = [
      { pet_id: 'p', occurred_at: '2024-06-15T12:00:00', category: 'wet_food', amount: 76, unit: 'g' },
      { pet_id: 'p', occurred_at: '2024-06-15T12:00:00', category: 'liquids', amount: 40, unit: 'ml' },
    ];
    expect(formatLoggedNutritionMessage(payloads)).toBe('Logged 76 g wet + 40 ml liquid');
  });

  it('formats a single category', () => {
    const payloads: CreateNutritionRecord[] = [
      { pet_id: 'p', occurred_at: '2024-06-15T12:00:00', category: 'water', amount: 50, unit: 'ml' },
    ];
    expect(formatLoggedNutritionMessage(payloads)).toBe('Logged 50 ml water');
  });
});
