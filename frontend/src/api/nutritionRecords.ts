import { api } from './client';
import type { CreateNutritionRecord, NutritionRecord, UpdateNutritionRecord } from '../types';

export interface NutritionRecordFilters {
  pet_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const nutritionRecordsApi = {
  list: (filters: NutritionRecordFilters = {}) =>
    api.get<NutritionRecord[]>(`/nutrition/records${toQueryString(filters as Record<string, string | number | undefined>)}`),
  get: (id: string) => api.get<NutritionRecord>(`/nutrition/records/${id}`),
  create: (data: CreateNutritionRecord) => api.post<NutritionRecord>('/nutrition/records', data),
  batchCreate: (records: CreateNutritionRecord[]) =>
    api.post<NutritionRecord[]>('/nutrition/records/batch', { records }),
  update: (id: string, data: UpdateNutritionRecord) => api.patch<NutritionRecord>(`/nutrition/records/${id}`, data),
  delete: (id: string) => api.delete(`/nutrition/records/${id}`),
};
