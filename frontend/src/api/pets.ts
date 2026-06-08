import { api } from './client';
import type { Pet, PetSpecies, PetStatus } from '../types';

export const petsApi = {
  list: () => api.get<Pet[]>('/pets'),
  get: (id: string) => api.get<Pet>(`/pets/${id}`),
  create: (data: { name: string; species?: PetSpecies; status?: PetStatus; weight_kg?: number; feeding_notes?: string }) =>
    api.post<Pet>('/pets', data),
  update: (id: string, data: Partial<{ name: string; species: PetSpecies; status: PetStatus; weight_kg: number; feeding_notes: string }>) =>
    api.patch<Pet>(`/pets/${id}`, data),
  delete: (id: string) => api.delete(`/pets/${id}`),
};
