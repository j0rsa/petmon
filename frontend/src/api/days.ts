import { api } from './client';
import type { DaySummary } from '../types';

export const daysApi = {
  getSummary: (date: string, catId?: string) => api.get<DaySummary>(`/days/${date}${catId ? `?cat_id=${catId}` : ''}`),
  updateNote: (date: string, note: string, catId?: string) => api.patch<void>(`/days/${date}/note`, { note, cat_id: catId }),
};
