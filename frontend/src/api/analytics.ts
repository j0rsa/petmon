import { api } from './client';
import type { DailyTotal, RangeSummary } from '../types';

export const analyticsApi = {
  dailyTotals: (dateFrom: string, dateTo: string, catId?: string) =>
    api.get<DailyTotal[]>(
      `/analytics/daily-totals?date_from=${dateFrom}&date_to=${dateTo}${catId ? `&cat_id=${catId}` : ''}`,
    ),
  rangeSummary: (dateFrom: string, dateTo: string, catId?: string) =>
    api.get<RangeSummary>(
      `/analytics/range-summary?date_from=${dateFrom}&date_to=${dateTo}${catId ? `&cat_id=${catId}` : ''}`,
    ),
};
