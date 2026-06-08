export const PET_SPECIES = ['cat', 'dog', 'bunny', 'parrot', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_STATUSES = ['alive', 'deceased', 'archived', 'rehomed'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const PET_STATUS_LABELS: Record<PetStatus, string> = {
  alive: 'Alive',
  deceased: 'Deceased',
  archived: 'Archived',
  rehomed: 'Rehomed',
};

export const PET_SPECIES_LABELS: Record<PetSpecies, string> = {
  cat: 'Cat',
  dog: 'Dog',
  bunny: 'Bunny',
  parrot: 'Parrot',
  other: 'Other',
};

export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  status: PetStatus;
  weight_kg?: number;
  feeding_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface NutritionRecord {
  id: string;
  pet_id: string;
  occurred_at: string;
  local_date: string;
  category: string;
  amount: number;
  unit?: string;
  note?: string;
  source_type: string;
  created_at: string;
  updated_at: string;
}

export interface CreateNutritionRecord {
  pet_id: string;
  occurred_at: string;
  local_date?: string;
  category: string;
  amount: number;
  unit?: string;
  note?: string;
}

export interface UpdateNutritionRecord {
  occurred_at?: string;
  local_date?: string;
  category?: string;
  amount?: number;
  unit?: string;
  note?: string;
}

export interface NutritionDaySummary {
  local_date: string;
  pet_id?: string;
  records: NutritionRecord[];
  totals_by_category: Record<string, number>;
  note?: string;
}

export interface NutritionDailyTotal {
  local_date: string;
  pet_id: string;
  category: string;
  total_amount: number;
  record_count: number;
}

export interface NutritionRangeSummary {
  date_from: string;
  date_to: string;
  pet_id?: string;
  daily_totals: NutritionDailyTotal[];
  category_averages: Record<string, number>;
}

export interface NutritionSchedule {
  id: string;
  pet_id: string;
  name: string;
  active: boolean;
  rules_json: string;
  created_at: string;
  updated_at: string;
}

export const CATEGORIES = ['wet_food', 'dry_food', 'water', 'treats', 'medication', 'custom'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  wet_food: 'Wet Food',
  dry_food: 'Dry Food',
  water: 'Water',
  treats: 'Treats',
  medication: 'Medication',
  custom: 'Custom',
};

export const CATEGORY_COLORS: Record<string, string> = {
  wet_food: '#4f9cf9',
  dry_food: '#f9a74f',
  water: '#4fd9f9',
  treats: '#f94f9c',
  medication: '#9c4ff9',
  custom: '#4ff9a7',
};
