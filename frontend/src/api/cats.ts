import { api } from './client';
import type { Cat } from '../types';

export const catsApi = {
  list: () => api.get<Cat[]>('/cats'),
  get: (id: string) => api.get<Cat>(`/cats/${id}`),
  create: (data: { name: string; status?: string; weight_kg?: number; feeding_notes?: string }) =>
    api.post<Cat>('/cats', data),
  update: (id: string, data: Partial<{ name: string; status: string; weight_kg: number; feeding_notes: string }>) =>
    api.patch<Cat>(`/cats/${id}`, data),
  delete: (id: string) => api.delete(`/cats/${id}`),
};
