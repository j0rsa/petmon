import { api } from './client';
import type { CreateEntry, Entry, UpdateEntry } from '../types';

export interface EntryFilters {
  cat_id?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.append(key, String(value));
    }
  }

  return query.toString() ? `?${query.toString()}` : '';
}

export const entriesApi = {
  list: (filters: EntryFilters = {}) =>
    api.get<Entry[]>(`/entries${toQueryString(filters as Record<string, string | number | undefined>)}`),
  get: (id: string) => api.get<Entry>(`/entries/${id}`),
  create: (data: CreateEntry) => api.post<Entry>('/entries', data),
  update: (id: string, data: UpdateEntry) => api.patch<Entry>(`/entries/${id}`, data),
  delete: (id: string) => api.delete(`/entries/${id}`),
};
