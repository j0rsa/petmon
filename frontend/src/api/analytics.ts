import { api } from './client';
import type { BestFluidDay, NutritionDailyTotal, NutritionRangeSummary } from '../types';

export const nutritionAnalyticsApi = {
  dailyTotals: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<NutritionDailyTotal[]>(
      `/nutrition/analytics/daily-totals?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
  rangeSummary: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<NutritionRangeSummary>(
      `/nutrition/analytics/range-summary?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
  bestFluidDay: (excludeDate: string, petId?: string) =>
    api.get<BestFluidDay | null>(
      `/nutrition/analytics/best-fluid-day?exclude_date=${excludeDate}${petId ? `&pet_id=${petId}` : ''}`,
    ),
};
