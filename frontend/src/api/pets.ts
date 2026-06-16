import { api } from './client';
import type { Pet, PetSpecies, PetStatus } from '../types';

export interface PetProfilePayload {
  name?: string;
  species?: PetSpecies;
  status?: PetStatus;
  breed?: string;
  birth_date?: string;
  blood_type?: string;
  color?: string;
  weight_kg?: number;
  feeding_notes?: string;
}

export const petsApi = {
  list: () => api.get<Pet[]>('/pets'),
  get: (id: string) => api.get<Pet>(`/pets/${id}`),
  create: (data: PetProfilePayload & { name: string }) => api.post<Pet>('/pets', data),
  update: (id: string, data: PetProfilePayload) => api.patch<Pet>(`/pets/${id}`, data),
  delete: (id: string) => api.delete(`/pets/${id}`),
};
