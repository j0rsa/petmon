export interface Cat {
  id: string;
  name: string;
  status: string;
  weight_kg?: number;
  feeding_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  cat_id: string;
  occurred_at: string;
  local_date: string;
  category: string;
  amount: number;
  unit?: string;
  note?: string;
  source_type: string;
  import_batch_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEntry {
  cat_id: string;
  occurred_at: string;
  local_date?: string;
  category: string;
  amount: number;
  unit?: string;
  note?: string;
}

export interface UpdateEntry {
  occurred_at?: string;
  local_date?: string;
  category?: string;
  amount?: number;
  unit?: string;
  note?: string;
}

export interface DaySummary {
  local_date: string;
  cat_id?: string;
  entries: Entry[];
  totals_by_category: Record<string, number>;
  note?: string;
}

export interface DailyTotal {
  local_date: string;
  cat_id: string;
  category: string;
  total_amount: number;
  entry_count: number;
}

export interface RangeSummary {
  date_from: string;
  date_to: string;
  cat_id?: string;
  daily_totals: DailyTotal[];
  category_averages: Record<string, number>;
}

export interface Schedule {
  id: string;
  cat_id: string;
  name: string;
  active: boolean;
  rules_json: string;
  created_at: string;
  updated_at: string;
}

export interface ImportBatch {
  id: string;
  source_name: string;
  raw_text: string;
  parse_summary_json: string;
  created_at: string;
  committed_at?: string;
}

export interface ParsedLine {
  line_number: number;
  raw: string;
  parsed?: CreateEntry;
  error?: string;
  warning?: string;
}

export interface ImportPreview {
  total_lines: number;
  parsed_count: number;
  error_count: number;
  warning_count: number;
  lines: ParsedLine[];
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
