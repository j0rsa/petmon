export const PET_SPECIES = ['cat', 'dog', 'bunny', 'parrot', 'other'] as const;
export type PetSpecies = (typeof PET_SPECIES)[number];

export const PET_STATUSES = ['active', 'archived'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const PET_STATUS_LABELS: Record<PetStatus, string> = {
  active: 'Active',
  archived: 'Archived',
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
  breed?: string;
  birth_date?: string;
  blood_type?: string;
  color?: string;
  feeding_notes?: string;
  telegram_nutrition_chat_id?: string;
  telegram_nutrition_thread_id?: string;
  telegram_meds_chat_id?: string;
  telegram_meds_thread_id?: string;
  elimination_auto_categorize_by_duration?: boolean;
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
  note?: string | null;
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
  note?: string | null;
}

export interface UpdateNutritionRecord {
  occurred_at?: string;
  local_date?: string;
  category?: string;
  amount?: number;
  unit?: string;
  note?: string | null;
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

export interface FluidCurvePoint {
  time: string;
  cumulative_fluid_ml: number;
  cumulative_liquids_ml: number;
}

export interface BestFluidDay {
  local_date: string;
  total_fluid_ml: number;
  curve: FluidCurvePoint[];
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

export const CATEGORIES = ['wet_food', 'dry_food', 'water', 'liquids'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories shown on analytics charts and summary tables. */
export const ANALYTICS_CATEGORIES = ['wet_food', 'dry_food', 'water', 'liquids'] as const;
export type AnalyticsCategory = (typeof ANALYTICS_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  wet_food: 'Wet Food',
  dry_food: 'Dry Food',
  water: 'Water',
  liquids: 'Liquids',
};

export const CATEGORY_COLORS: Record<string, string> = {
  wet_food: '#4fc8a0',
  dry_food: '#d9612a',
  water: '#a0e8f8',
  liquids: '#4fd8f8',
};
