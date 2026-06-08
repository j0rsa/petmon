import { api } from './client';
import type { Schedule } from '../types';

export const schedulesApi = {
  list: (catId?: string) => api.get<Schedule[]>(`/schedules${catId ? `?cat_id=${catId}` : ''}`),
  get: (id: string) => api.get<Schedule>(`/schedules/${id}`),
  create: (data: { cat_id: string; name: string; active?: boolean; rules?: unknown }) => api.post<Schedule>('/schedules', data),
  update: (id: string, data: Partial<{ name: string; active: boolean; rules: unknown }>) =>
    api.patch<Schedule>(`/schedules/${id}`, data),
  delete: (id: string) => api.delete(`/schedules/${id}`),
};
