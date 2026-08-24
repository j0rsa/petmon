import { api } from './client';

export type MedType = 'pill' | 'liquid';
export type PillShape =
  | 'freedom'
  | 'oval'
  | 'oval_rounded'
  | 'square'
  | 'capsule'
  | 'pentagon'
  | 'tear'
  | 'rectangle'
  | 'hexagon'
  | 'round'
  | 'triangle'
  | 'double_circle'
  | 'trapezoid'
  | 'octagon'
  | 'diamond';
export type DoseFraction = 'whole' | 'half' | 'third' | 'quarter' | 'three_quarter' | 'eighth' | 'sixteenth';

export interface MedFrequency {
  morning: number;
  midday: number;
  evening: number;
  every: number;
  unit: 'days' | 'weeks';
}

export interface Medication {
  id: string;
  pet_id: string;
  name: string;
  med_type: MedType;
  color: string;
  emoji: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedFormulation {
  id: string;
  medication_id: string;
  tablet_strength_mg: number | null;
  pill_shape: PillShape | null;
  liquid_concentration_mg_per_ml: number | null;
  created_at: string;
}

export interface MedAssignment {
  id: string;
  medication_id: string;
  pet_id: string;
  formulation_id: string;
  formulation: MedFormulation;
  dose_fraction: DoseFraction | null;
  liquid_dose_ml: number | null;
  effective_dose_mg: number | null;
  dose_label: string;
  frequency: MedFrequency;
  date_from: string;
  date_to: string | null;
  optional: boolean;
  created_at: string;
  updated_at: string;
}

export interface MedIntakeRecord {
  id: string;
  pet_id: string;
  medication_id: string;
  assignment_id: string;
  assignment: MedAssignment;
  dose_fraction_override: DoseFraction | null;
  liquid_dose_ml_override: number | null;
  effective_dose_fraction: DoseFraction | null;
  effective_dose_mg: number | null;
  dose_label: string;
  occurred_at: string;
  local_date: string;
  taken: boolean;
  note: string | null;
  source_type: string;
  created_at: string;
}

export interface DailyMedAssignment {
  medication: Medication;
  assignment: MedAssignment;
  intakes: MedIntakeRecord[];
}

export interface MedBundleItem {
  medication_id: string;
  medication: Medication;
}

export interface MedBundle {
  id: string;
  pet_id: string;
  name: string;
  items: MedBundleItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateMedication {
  pet_id: string;
  name: string;
  med_type: MedType;
  color?: string;
  emoji?: string;
}

export interface UpdateMedication {
  name?: string;
  color?: string;
  emoji?: string;
}

export interface CreateMedAssignment {
  medication_id: string;
  formulation_id?: string;
  tablet_strength_mg?: number;
  pill_shape?: PillShape;
  liquid_concentration_mg_per_ml?: number;
  dose_fraction?: DoseFraction;
  liquid_dose_ml?: number;
  frequency?: MedFrequency;
  date_from: string;
  date_to?: string | null;
  optional?: boolean;
}

export interface ReviseMedAssignment {
  formulation_id?: string;
  tablet_strength_mg?: number;
  pill_shape?: PillShape;
  liquid_concentration_mg_per_ml?: number;
  dose_fraction?: DoseFraction;
  liquid_dose_ml?: number;
  frequency?: MedFrequency;
  effective_from: string;
  date_to?: string | null;
  optional?: boolean;
}

export interface CreateMedIntakeRecord {
  pet_id: string;
  medication_id: string;
  assignment_id?: string;
  dose_fraction_override?: DoseFraction;
  liquid_dose_ml_override?: number;
  taken?: boolean;
  occurred_at?: string;
  local_date?: string;
  note?: string;
}

export interface CreateMedBundle {
  pet_id: string;
  name?: string;
  assignment_ids: string[];
}

export interface CreateMedBundleIntake {
  occurred_at?: string;
  local_date?: string;
  note?: string;
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

export const medicationsApi = {
  list: (petId: string) => api.get<Medication[]>(`/health/meds?pet_id=${petId}`),
  get: (id: string) => api.get<Medication>(`/health/meds/${id}`),
  create: (data: CreateMedication) => api.post<Medication>('/health/meds', data),
  update: (id: string, data: UpdateMedication) => api.patch<Medication>(`/health/meds/${id}`, data),
  delete: (id: string) => api.delete(`/health/meds/${id}`),

  listFormulations: (medicationId: string) =>
    api.get<MedFormulation[]>(`/health/meds/formulations?medication_id=${medicationId}`),

  listAssignments: (filters: { pet_id?: string; medication_id?: string } = {}) =>
    api.get<MedAssignment[]>(`/health/meds/assignments${toQueryString(filters)}`),

  dailyAssignments: (petId: string, date: string) =>
    api.get<DailyMedAssignment[]>(`/health/meds/assignments/daily?pet_id=${petId}&date=${date}`),

  createAssignment: (data: CreateMedAssignment) =>
    api.post<MedAssignment>('/health/meds/assignments', data),

  reviseAssignment: (id: string, data: ReviseMedAssignment) =>
    api.post<MedAssignment>(`/health/meds/assignments/${id}/revise`, data),

  endAssignment: (id: string, data: { ended_on?: string } = {}) =>
    api.post<MedAssignment>(`/health/meds/assignments/${id}/end`, data),

  deleteAssignment: (id: string) => api.delete(`/health/meds/assignments/${id}`),

  listIntake: (filters: {
    pet_id?: string;
    medication_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  } = {}) => api.get<MedIntakeRecord[]>(`/health/meds/intake${toQueryString(filters)}`),

  createIntake: (data: CreateMedIntakeRecord) =>
    api.post<MedIntakeRecord>('/health/meds/intake', data),

  deleteIntake: (id: string) => api.delete(`/health/meds/intake/${id}`),

  listBundles: (petId: string) =>
    api.get<MedBundle[]>(`/health/meds/bundles${toQueryString({ pet_id: petId })}`),

  createBundle: (data: CreateMedBundle) =>
    api.post<MedBundle>('/health/meds/bundles', data),

  updateBundle: (id: string, data: { name: string }) =>
    api.patch<MedBundle>(`/health/meds/bundles/${id}`, data),

  deleteBundle: (id: string) => api.delete(`/health/meds/bundles/${id}`),

  createBundleIntake: (id: string, data: CreateMedBundleIntake = {}) =>
    api.post<MedIntakeRecord[]>(`/health/meds/bundles/${id}/intake`, data),
};
