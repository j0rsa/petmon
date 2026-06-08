import { api } from './client';
import type { NutritionSchedule } from '../types';

export const nutritionSchedulesApi = {
  list: (petId?: string) => api.get<NutritionSchedule[]>(`/nutrition/schedules${petId ? `?pet_id=${petId}` : ''}`),
  get: (id: string) => api.get<NutritionSchedule>(`/nutrition/schedules/${id}`),
  create: (data: { pet_id: string; name: string; active?: boolean; rules?: unknown }) =>
    api.post<NutritionSchedule>('/nutrition/schedules', data),
  update: (id: string, data: { name?: string; active?: boolean; rules?: unknown }) =>
    api.patch<NutritionSchedule>(`/nutrition/schedules/${id}`, data),
  delete: (id: string) => api.delete(`/nutrition/schedules/${id}`),
};
