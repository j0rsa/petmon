import { api } from './client';

export type EliminationEventType = 'general' | 'urination' | 'defecation' | 'vomit';
export type DefecationSubtype = 'normal' | 'soft' | 'liquid' | 'hard' | 'blood' | 'mucus';
export type VomitSubtype = 'food' | 'fur' | 'bile' | 'other';

export interface EliminationRecord {
  id: string;
  pet_id: string;
  occurred_at: string;
  local_date: string;
  event_type: EliminationEventType;
  subtype: string | null;
  duration_seconds: number | null;
  note: string | null;
  source_type: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEliminationRecord {
  pet_id: string;
  occurred_at?: string;
  local_date?: string;
  event_type: EliminationEventType;
  subtype?: string | null;
  duration_seconds?: number | null;
  note?: string | null;
  source_type?: string;
}

export interface UpdateEliminationRecord {
  occurred_at?: string;
  local_date?: string;
  event_type?: EliminationEventType;
  subtype?: string | null;
  duration_seconds?: number | null;
  note?: string | null;
}

export interface EliminationRecordFilters {
  pet_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  event_type?: EliminationEventType;
  limit?: number;
  offset?: number;
}

export interface EliminationDailySummary {
  local_date: string;
  pet_id: string | null;
  total_count: number;
  urination_count: number;
  defecation_count: number;
  vomit_count: number;
  general_count: number;
  has_vomit: boolean;
}

export interface EliminationRangeSummary {
  date_from: string;
  date_to: string;
  pet_id: string | null;
  daily_summaries: EliminationDailySummary[];
  type_totals: Record<string, number>;
  avg_per_day: number;
  p50_per_day: number;
  p90_per_day: number;
  p99_per_day: number;
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

export const eliminationApi = {
  list: (filters: EliminationRecordFilters = {}) =>
    api.get<EliminationRecord[]>(
      `/elimination/records${toQueryString(filters as Record<string, string | number | undefined>)}`,
    ),
  get: (id: string) => api.get<EliminationRecord>(`/elimination/records/${id}`),
  create: (data: CreateEliminationRecord) => api.post<EliminationRecord>('/elimination/records', data),
  update: (id: string, data: UpdateEliminationRecord) =>
    api.patch<EliminationRecord>(`/elimination/records/${id}`, data),
  delete: (id: string) => api.delete(`/elimination/records/${id}`),
  dailySummaries: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<EliminationDailySummary[]>(
      `/elimination/analytics/daily-summaries?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
  rangeSummary: (dateFrom: string, dateTo: string, petId?: string) =>
    api.get<EliminationRangeSummary>(
      `/elimination/analytics/range-summary?date_from=${dateFrom}&date_to=${dateTo}${petId ? `&pet_id=${petId}` : ''}`,
    ),
};
