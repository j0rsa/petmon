import { api } from './client';
import type { NutritionDaySummary } from '../types';

export const daysApi = {
  getSummary: (date: string, petId?: string) => api.get<NutritionDaySummary>(`/days/${date}${petId ? `?pet_id=${petId}` : ''}`),
  updateNote: (date: string, note: string, petId?: string) => api.patch<void>(`/days/${date}/note`, { note, pet_id: petId }),
};
