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
  tags?: string[];
}

export interface WeightTagCount {
  tag: string;
  count: number;
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

export interface WeightStats {
  latest_kg: number | null;
  latest_date: string | null;
  avg_kg: number | null;
  count: number;
}

export type WeightGranularity = 'raw' | 'daily' | 'weekly' | 'monthly';

export interface WeightSummaryBucket {
  bucket: string;
  tag?: string | null;
  avg_kg: number;
  min_kg: number;
  max_kg: number;
  count: number;
}

export type WeightGroupBy = 'none' | 'tag';

export interface WeightSummaryFilters {
  pet_id: string;
  date_from?: string;
  date_to: string;
  granularity?: WeightGranularity;
  group_by?: WeightGroupBy;
}

export interface UpdateWeightRecord {
  note?: string | null;
}

export const weightApi = {
  list: (filters: WeightRecordFilters = {}) => {
    const { tags, ...rest } = filters;
    return api.get<WeightRecord[]>(
      `/health/weight${toQueryString({
        ...(rest as Record<string, string | number | undefined>),
        tags: tags && tags.length > 0 ? tags.join(',') : undefined,
      })}`,
    );
  },
  tags: (petId: string) =>
    api.get<WeightTagCount[]>(`/health/weight/tags${toQueryString({ pet_id: petId })}`),
  stats: (petId: string, dateFrom: string, dateTo: string) =>
    api.get<WeightStats>(`/health/weight/stats?pet_id=${encodeURIComponent(petId)}&date_from=${dateFrom}&date_to=${dateTo}`),
  summary: (filters: WeightSummaryFilters) =>
    api.get<WeightSummaryBucket[]>(
      `/health/weight/summary${toQueryString(filters as unknown as Record<string, string | undefined>)}`,
    ),
  create: (data: CreateWeightRecord) => api.post<WeightRecord>('/health/weight', data),
  update: (id: string, data: UpdateWeightRecord) =>
    api.patch<WeightRecord>(`/health/weight/${id}`, data),
  delete: (id: string) => api.delete(`/health/weight/${id}`),
};
