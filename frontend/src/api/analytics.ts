import { api } from './client';
import type { NutritionDailyTotal, NutritionRangeSummary } from '../types';

export const nutritionAnalyticsApi = {
  dailyTotals: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<NutritionDailyTotal[]>(
      `/nutrition/analytics/daily-totals?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
  rangeSummary: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<NutritionRangeSummary>(
      `/nutrition/analytics/range-summary?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
};
