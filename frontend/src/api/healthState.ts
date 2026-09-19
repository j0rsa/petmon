import { api } from './client';
import type { HealthStateLevel } from '../lib/healthState';

export interface HealthStateRecord {
  id: string;
  pet_id: string;
  occurred_at: string;
  local_date: string;
  level: HealthStateLevel;
  note: string | null;
  source_type: string;
  created_at: string;
}

export interface CreateHealthStateRecord {
  pet_id: string;
  level: HealthStateLevel;
  occurred_at?: string;
  local_date?: string;
  note?: string | null;
  source_type?: string;
}

export interface HealthStateRecordFilters {
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

export const healthStateApi = {
  list: (filters: HealthStateRecordFilters = {}) =>
    api.get<HealthStateRecord[]>(
      `/health/state${toQueryString(filters as Record<string, string | number | undefined>)}`,
    ),
  create: (data: CreateHealthStateRecord) => api.post<HealthStateRecord>('/health/state', data),
  delete: (id: string) => api.delete(`/health/state/${id}`),
};
