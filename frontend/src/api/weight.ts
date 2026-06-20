import { api } from './client';

export interface WeightRecord {
  id: string;
  pet_id: string;
  measured_at: string;
  local_date: string;
  weight_kg: number;
  note: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWeightRecord {
  pet_id: string;
  measured_at?: string;
  local_date?: string;
  weight_kg: number;
  note?: string | null;
  source_type?: string;
}

export interface WeightRecordFilters {
  pet_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const weightApi = {
  list: (filters: WeightRecordFilters = {}) =>
    api.get<WeightRecord[]>(
      `/health/weight${toQueryString(filters as Record<string, string | number | undefined>)}`,
    ),
  create: (data: CreateWeightRecord) => api.post<WeightRecord>('/health/weight', data),
  delete: (id: string) => api.delete(`/health/weight/${id}`),
};
