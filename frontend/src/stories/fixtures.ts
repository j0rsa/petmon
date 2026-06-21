import { localToday, shiftDate } from '../lib/dates';
import type { BestFluidDay, Category, NutritionDaySummary, NutritionRangeSummary, NutritionRecord, NutritionSchedule, Pet } from '../types';
import type { DayNutritionHighlight, DayEliminationHighlight } from '../types/pillars';
import type { AppInfo } from '../api/info';
import type { ApiTokenCreated, ApiTokenPublic, DisplaySettings, OidcConfigPublic, TelegramConfigPublic } from '../api/settings';
import type { EliminationRecord, EliminationDailySummary, EliminationRangeSummary } from '../api/elimination';
import type { WeightRecord } from '../api/weight';

export const mockPetId = '550e8400-e29b-41d4-a716-446655440000';

export const mockPets: Pet[] = [
  {
    id: mockPetId,
    name: 'Mittens',
    species: 'cat',
    status: 'active',
    breed: 'British Shorthair',
    birth_date: '2020-03-15',
    blood_type: 'A',
    color: '#c4a882',
    weight_kg: 4.2,
    feeding_notes: 'Prefers wet food in the morning.',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    name: 'Rex',
    species: 'dog',
    status: 'active',
    breed: 'Golden Retriever',
    birth_date: '2019-07-22',
    color: '#8b6f47',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

// 14 entries matching the reference screenshot: 7 wet_food + 7 liquids pairs
// liquids total: 12+13+12+13+12+15+17 = 94 ml
// wet_food total: 15+16+17+13+12+16+20 = 109 g  → fluid from food ≈ 84 ml  → total ~178 ml
export const mockNutritionRecords: NutritionRecord[] = [
  { id: 'rec-01', pet_id: mockPetId, occurred_at: '2024-06-15T03:12:00', local_date: '2024-06-15', category: 'liquids',  amount: 12, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T03:12:00', updated_at: '2024-06-15T03:12:00' },
  { id: 'rec-02', pet_id: mockPetId, occurred_at: '2024-06-15T03:13:00', local_date: '2024-06-15', category: 'wet_food', amount: 15, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T03:13:00', updated_at: '2024-06-15T03:13:00' },
  { id: 'rec-03', pet_id: mockPetId, occurred_at: '2024-06-15T05:40:00', local_date: '2024-06-15', category: 'liquids',  amount: 13, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T05:40:00', updated_at: '2024-06-15T05:40:00' },
  { id: 'rec-04', pet_id: mockPetId, occurred_at: '2024-06-15T05:40:00', local_date: '2024-06-15', category: 'wet_food', amount: 16, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T05:40:00', updated_at: '2024-06-15T05:40:00' },
  { id: 'rec-05', pet_id: mockPetId, occurred_at: '2024-06-15T08:16:00', local_date: '2024-06-15', category: 'liquids',  amount: 12, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T08:16:00', updated_at: '2024-06-15T08:16:00' },
  { id: 'rec-06', pet_id: mockPetId, occurred_at: '2024-06-15T08:16:00', local_date: '2024-06-15', category: 'wet_food', amount: 17, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T08:16:00', updated_at: '2024-06-15T08:16:00' },
  { id: 'rec-07', pet_id: mockPetId, occurred_at: '2024-06-15T10:45:00', local_date: '2024-06-15', category: 'liquids',  amount: 13, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T10:45:00', updated_at: '2024-06-15T10:45:00' },
  { id: 'rec-08', pet_id: mockPetId, occurred_at: '2024-06-15T10:45:00', local_date: '2024-06-15', category: 'wet_food', amount: 13, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T10:45:00', updated_at: '2024-06-15T10:45:00' },
  { id: 'rec-09', pet_id: mockPetId, occurred_at: '2024-06-15T15:13:00', local_date: '2024-06-15', category: 'liquids',  amount: 12, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T15:13:00', updated_at: '2024-06-15T15:13:00' },
  { id: 'rec-10', pet_id: mockPetId, occurred_at: '2024-06-15T15:13:00', local_date: '2024-06-15', category: 'wet_food', amount: 12, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T15:13:00', updated_at: '2024-06-15T15:13:00' },
  { id: 'rec-11', pet_id: mockPetId, occurred_at: '2024-06-15T16:11:00', local_date: '2024-06-15', category: 'liquids',  amount: 15, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T16:11:00', updated_at: '2024-06-15T16:11:00' },
  { id: 'rec-12', pet_id: mockPetId, occurred_at: '2024-06-15T19:11:00', local_date: '2024-06-15', category: 'wet_food', amount: 16, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T19:11:00', updated_at: '2024-06-15T19:11:00' },
  { id: 'rec-13', pet_id: mockPetId, occurred_at: '2024-06-15T21:05:00', local_date: '2024-06-15', category: 'liquids',  amount: 17, unit: 'ml', source_type: 'telegram', created_at: '2024-06-15T21:05:00', updated_at: '2024-06-15T21:05:00' },
  { id: 'rec-14', pet_id: mockPetId, occurred_at: '2024-06-15T21:05:00', local_date: '2024-06-15', category: 'wet_food', amount: 20, unit: 'g',  source_type: 'telegram', created_at: '2024-06-15T21:05:00', updated_at: '2024-06-15T21:05:00' },
];

export const mockDaySummary: NutritionDaySummary = {
  local_date: '2024-06-15',
  records: mockNutritionRecords,
  totals_by_category: {
    wet_food: 109,
    liquids: 94,
    water: 0,
    dry_food: 0,
  },
  note: 'Prednisolone given at 08:16 with food.',
};

export const mockEmptyDaySummary: NutritionDaySummary = {
  local_date: '2024-06-16',
  records: [],
  totals_by_category: {},
};

export const mockAnalyticsDateFrom = shiftDate(localToday(), -6);
export const mockAnalyticsDateTo = localToday();

function mockFluidRecord(
  id: string,
  localDate: string,
  time: string,
  category: Category,
  amount: number,
  petId = mockPetId,
): NutritionRecord {
  const occurredAt = `${localDate}T${time}:00`;
  return {
    id,
    pet_id: petId,
    occurred_at: occurredAt,
    local_date: localDate,
    category,
    amount,
    unit: category === 'water' || category === 'liquids' ? 'ml' : 'g',
    source_type: 'manual',
    created_at: occurredAt,
    updated_at: occurredAt,
  };
}

/** Records across the analytics window — focus day matches the cumulative fluid chart prototype. */
export const mockAnalyticsRecords: NutritionRecord[] = [
  // Best water day (excluded from comparison when viewing focus day)
  mockFluidRecord('fluid-best-1', shiftDate(mockAnalyticsDateTo, -2), '06:15', 'water', 35),
  mockFluidRecord('fluid-best-2', shiftDate(mockAnalyticsDateTo, -2), '09:00', 'water', 40),
  mockFluidRecord('fluid-best-3', shiftDate(mockAnalyticsDateTo, -2), '12:30', 'water', 30),
  mockFluidRecord('fluid-best-4', shiftDate(mockAnalyticsDateTo, -2), '18:00', 'water', 25),
  mockFluidRecord('fluid-best-5', shiftDate(mockAnalyticsDateTo, -2), '21:00', 'wet_food', 80),
  // Focus day — step curve for liquids
  mockFluidRecord('fluid-focus-1', mockAnalyticsDateTo, '06:30', 'liquids', 30),
  mockFluidRecord('fluid-focus-2', mockAnalyticsDateTo, '07:00', 'liquids', 25),
  mockFluidRecord('fluid-focus-3', mockAnalyticsDateTo, '08:30', 'liquids', 15),
  mockFluidRecord('fluid-focus-4', mockAnalyticsDateTo, '08:30', 'wet_food', 85),
  mockFluidRecord('fluid-focus-5', mockAnalyticsDateTo, '11:00', 'liquids', 10),
  mockFluidRecord('fluid-focus-6', mockAnalyticsDateTo, '13:30', 'liquids', 15),
  mockFluidRecord('fluid-focus-7', mockAnalyticsDateTo, '19:00', 'dry_food', 15),
  // Earlier range days for bar chart context
  mockFluidRecord('fluid-range-1', mockAnalyticsDateFrom, '08:00', 'wet_food', 78),
  mockFluidRecord('fluid-range-2', mockAnalyticsDateFrom, '12:00', 'water', 42),
  mockFluidRecord('fluid-range-3', shiftDate(mockAnalyticsDateFrom, 1), '08:30', 'wet_food', 85),
  mockFluidRecord('fluid-range-4', shiftDate(mockAnalyticsDateFrom, 1), '12:00', 'water', 50),
];

export const mockNutritionSchedules: NutritionSchedule[] = [
  {
    id: 'sched-1',
    pet_id: mockPetId,
    name: 'Mittens hydration routine',
    active: true,
    rules_json: JSON.stringify([
      { category: 'liquids', target_amount: 13, unit: 'ml', time_of_day: '06:00', notes: 'First morning liquid, gentle start' },
      { category: 'liquids', target_amount: 13, unit: 'ml', time_of_day: '08:30', notes: 'Good second portion' },
      { category: 'wet_food', target_amount: 16, unit: 'g',  time_of_day: '08:30', notes: 'Morning wet food' },
      { category: 'liquids', target_amount: 11, unit: 'ml', time_of_day: '11:00', notes: 'Midday support' },
      { category: 'liquids', target_amount: 11, unit: 'ml', time_of_day: '13:30', notes: 'Keep it steady' },
      { category: 'liquids', target_amount: 13, unit: 'ml', time_of_day: '15:30', notes: 'Important afternoon portion' },
      { category: 'wet_food', target_amount: 16, unit: 'g',  time_of_day: '15:30', notes: 'Afternoon wet food' },
      { category: 'liquids', target_amount: 11, unit: 'ml', time_of_day: '17:30', notes: 'Before the fasting window' },
      { category: 'liquids', target_amount: 11, unit: 'ml', time_of_day: '22:00', notes: 'With prednisolone, if she accepts' },
      { category: 'wet_food', target_amount: 16, unit: 'g',  time_of_day: '22:00', notes: 'Evening wet food' },
    ]),
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
];

export const mockRangeSummary: NutritionRangeSummary = {
  date_from: mockAnalyticsDateFrom,
  date_to: mockAnalyticsDateTo,
  daily_totals: [
    { local_date: mockAnalyticsDateFrom, pet_id: mockPetId, category: 'wet_food', total_amount: 78, record_count: 2 },
    { local_date: mockAnalyticsDateFrom, pet_id: mockPetId, category: 'water', total_amount: 42, record_count: 1 },
    { local_date: mockAnalyticsDateFrom, pet_id: mockPetId, category: 'dry_food', total_amount: 14, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 1), pet_id: mockPetId, category: 'wet_food', total_amount: 85, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 1), pet_id: mockPetId, category: 'water', total_amount: 50, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 1), pet_id: mockPetId, category: 'liquids', total_amount: 4, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 2), pet_id: mockPetId, category: 'wet_food', total_amount: 80, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 2), pet_id: mockPetId, category: 'dry_food', total_amount: 16, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 3), pet_id: mockPetId, category: 'wet_food', total_amount: 72, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 3), pet_id: mockPetId, category: 'water', total_amount: 55, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 4), pet_id: mockPetId, category: 'wet_food', total_amount: 88, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 4), pet_id: mockPetId, category: 'water', total_amount: 48, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 4), pet_id: mockPetId, category: 'liquids', total_amount: 6, record_count: 1 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 5), pet_id: mockPetId, category: 'wet_food', total_amount: 83, record_count: 2 },
    { local_date: shiftDate(mockAnalyticsDateFrom, 5), pet_id: mockPetId, category: 'dry_food', total_amount: 12, record_count: 1 },
    { local_date: mockAnalyticsDateTo, pet_id: mockPetId, category: 'wet_food', total_amount: 90, record_count: 2 },
    { local_date: mockAnalyticsDateTo, pet_id: mockPetId, category: 'water', total_amount: 60, record_count: 2 },
    { local_date: mockAnalyticsDateTo, pet_id: mockPetId, category: 'dry_food', total_amount: 15, record_count: 1 },
  ],
  category_averages: {
    wet_food: 82.3,
    dry_food: 14.3,
    water: 51,
    liquids: 5,
  },
};

export const mockEmptyRangeSummary: NutritionRangeSummary = {
  date_from: mockAnalyticsDateFrom,
  date_to: mockAnalyticsDateTo,
  daily_totals: [],
  category_averages: {
    wet_food: 0,
    dry_food: 0,
    water: 0,
    liquids: 0,
  },
};

export function mockCalendarHighlights(month = '2024-06'): Map<string, DayNutritionHighlight> {
  const map = new Map<string, DayNutritionHighlight>();
  map.set(`${month}-15`, { recordCount: 2, wetFood: 85, water: 20, liquids: 30, dryFood: 0 });
  map.set(`${month}-14`, { recordCount: 3, wetFood: 70, water: 40, liquids: 0, dryFood: 15 });
  map.set(`${month}-10`, { recordCount: 1, wetFood: 0, water: 30, liquids: 0, dryFood: 0 });
  return map;
}

// ── Best fluid day fixture ────────────────────────────────────────────────────

export const mockBestFluidDay: BestFluidDay = {
  local_date: '2024-06-10',
  total_fluid_ml: 142,
  curve: [
    { time: '06:15', cumulative_fluid_ml: 12,  cumulative_liquids_ml: 12  },
    { time: '08:30', cumulative_fluid_ml: 27,  cumulative_liquids_ml: 22  },
    { time: '11:00', cumulative_fluid_ml: 40,  cumulative_liquids_ml: 32  },
    { time: '13:30', cumulative_fluid_ml: 53,  cumulative_liquids_ml: 42  },
    { time: '15:45', cumulative_fluid_ml: 68,  cumulative_liquids_ml: 52  },
    { time: '17:30', cumulative_fluid_ml: 81,  cumulative_liquids_ml: 62  },
    { time: '19:00', cumulative_fluid_ml: 95,  cumulative_liquids_ml: 70  },
    { time: '21:15', cumulative_fluid_ml: 110, cumulative_liquids_ml: 80  },
    { time: '22:30', cumulative_fluid_ml: 142, cumulative_liquids_ml: 95  },
  ],
};

// ── App info fixture ──────────────────────────────────────────────────────────

export const mockAppInfo: AppInfo = {
  version: '0.0.0-storybook',
  git_sha: 'abc1234',
};

// ── Display settings fixtures ─────────────────────────────────────────────────

export const mockDisplaySettings: DisplaySettings = {
  time_format: 'h24',
  date_format: 'dmy',
  show_water_card: true,
  calendar_show_wet_food: true,
  calendar_show_liquids: true,
  calendar_show_water: true,
  calendar_show_dry_food: true,
  calendar_show_record_count: true,
  calendar_show_total_fluid: true,
  calendar_week_start: 'sunday',
};

// ── Settings fixtures ─────────────────────────────────────────────────────────

export const mockOidcEmpty: OidcConfigPublic = {
  enabled: false,
  issuer_url: null,
  client_id: null,
};

export const mockOidcConfigured: OidcConfigPublic = {
  enabled: true,
  issuer_url: 'https://sso.example.com',
  client_id: 'petmon-app',
};

export const mockTelegramEmpty: TelegramConfigPublic = {
  enabled: false,
  has_bot_token: false,
};

export const mockTelegramConfigured: TelegramConfigPublic = {
  enabled: true,
  has_bot_token: true,
};

export const mockApiTokens: ApiTokenPublic[] = [
  {
    id: 'tok-1',
    alias: 'mobile-app',
    active: true,
    current: true,
    created_by: 'admin',
    created_at: '2025-01-10T09:00:00Z',
    last_used_at: '2025-06-01T14:22:00Z',
  },
  {
    id: 'tok-2',
    alias: null,
    active: true,
    current: false,
    created_by: null,
    created_at: '2025-03-15T11:30:00Z',
    last_used_at: null,
  },
  {
    id: 'tok-3',
    alias: 'old-script',
    active: false,
    current: false,
    created_by: 'admin',
    created_at: '2024-11-01T08:00:00Z',
    last_used_at: '2024-12-20T10:00:00Z',
  },
];

export const mockCreatedToken: ApiTokenCreated = {
  id: 'tok-new',
  alias: 'my-device',
  token: 'pm_api_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  created_at: '2026-06-17T12:00:00Z',
};

// ── Elimination fixtures ──────────────────────────────────────────────────────

const elim_date = '2024-06-15';

export const mockEliminationRecords: EliminationRecord[] = [
  {
    id: 'elim-01', pet_id: mockPetId, occurred_at: `${elim_date}T06:15:00`, local_date: elim_date,
    event_type: 'urination', subtype: null, duration_seconds: null, note: null,
    source_type: 'manual', created_at: `${elim_date}T06:15:00`, updated_at: `${elim_date}T06:15:00`,
  },
  {
    id: 'elim-02', pet_id: mockPetId, occurred_at: `${elim_date}T08:30:00`, local_date: elim_date,
    event_type: 'defecation', subtype: 'normal', duration_seconds: 90, note: 'Normal stool',
    source_type: 'manual', created_at: `${elim_date}T08:30:00`, updated_at: `${elim_date}T08:30:00`,
  },
  {
    id: 'elim-03', pet_id: mockPetId, occurred_at: `${elim_date}T11:00:00`, local_date: elim_date,
    event_type: 'urination', subtype: null, duration_seconds: null, note: null,
    source_type: 'manual', created_at: `${elim_date}T11:00:00`, updated_at: `${elim_date}T11:00:00`,
  },
  {
    id: 'elim-04', pet_id: mockPetId, occurred_at: `${elim_date}T14:45:00`, local_date: elim_date,
    event_type: 'vomit', subtype: 'bile', duration_seconds: null, note: 'Yellow bile, small amount',
    source_type: 'manual', created_at: `${elim_date}T14:45:00`, updated_at: `${elim_date}T14:45:00`,
  },
  {
    id: 'elim-05', pet_id: mockPetId, occurred_at: `${elim_date}T19:20:00`, local_date: elim_date,
    event_type: 'urination', subtype: null, duration_seconds: null, note: null,
    source_type: 'manual', created_at: `${elim_date}T19:20:00`, updated_at: `${elim_date}T19:20:00`,
  },
];

export const mockEliminationDaySummary: EliminationDailySummary = {
  local_date: elim_date,
  pet_id: mockPetId,
  total_count: 5,
  urination_count: 3,
  defecation_count: 1,
  vomit_count: 1,
  general_count: 0,
  has_vomit: true,
  avg_duration_seconds: 95,
};

export function mockEliminationCalendarHighlights(month = '2024-06'): Map<string, DayEliminationHighlight> {
  const map = new Map<string, DayEliminationHighlight>();
  map.set(`${month}-15`, { totalCount: 5, hasVomit: true, avgDurationSec: 95 });
  map.set(`${month}-14`, { totalCount: 4, hasVomit: false, avgDurationSec: 72 });
  map.set(`${month}-10`, { totalCount: 3, hasVomit: false, avgDurationSec: null });
  return map;
}

export const mockEliminationRangeSummary: EliminationRangeSummary = {
  date_from: shiftDate(localToday(), -6),
  date_to: localToday(),
  pet_id: mockPetId,
  daily_summaries: [
    { local_date: shiftDate(localToday(), -6), pet_id: mockPetId, total_count: 4, urination_count: 2, defecation_count: 1, vomit_count: 0, general_count: 1, has_vomit: false, avg_duration_seconds: 80 },
    { local_date: shiftDate(localToday(), -5), pet_id: mockPetId, total_count: 3, urination_count: 2, defecation_count: 1, vomit_count: 0, general_count: 0, has_vomit: false, avg_duration_seconds: null },
    { local_date: shiftDate(localToday(), -4), pet_id: mockPetId, total_count: 5, urination_count: 3, defecation_count: 1, vomit_count: 1, general_count: 0, has_vomit: true, avg_duration_seconds: 120 },
    { local_date: shiftDate(localToday(), -3), pet_id: mockPetId, total_count: 4, urination_count: 2, defecation_count: 2, vomit_count: 0, general_count: 0, has_vomit: false, avg_duration_seconds: 95 },
    { local_date: shiftDate(localToday(), -2), pet_id: mockPetId, total_count: 6, urination_count: 4, defecation_count: 1, vomit_count: 0, general_count: 1, has_vomit: false, avg_duration_seconds: 70 },
    { local_date: shiftDate(localToday(), -1), pet_id: mockPetId, total_count: 4, urination_count: 3, defecation_count: 1, vomit_count: 0, general_count: 0, has_vomit: false, avg_duration_seconds: null },
    { local_date: localToday(), pet_id: mockPetId, total_count: 5, urination_count: 3, defecation_count: 1, vomit_count: 1, general_count: 0, has_vomit: true, avg_duration_seconds: 105 },
  ],
  type_totals: { urination: 19, defecation: 8, vomit: 2, general: 2 },
  avg_per_day: 4.4,
  p50_per_day: 4.0,
  p90_per_day: 5.8,
  p99_per_day: 6.0,
};

// ── Weight fixtures ───────────────────────────────────────────────────────────

export const mockWeightRecords: WeightRecord[] = [
  {
    id: 'wt-01', pet_id: mockPetId, measured_at: '2024-06-01T09:00:00', local_date: '2024-06-01',
    weight_kg: 4.2, note: 'Morning weigh-in', source_type: 'manual',
    created_at: '2024-06-01T09:00:00',
  },
  {
    id: 'wt-02', pet_id: mockPetId, measured_at: '2024-06-08T09:00:00', local_date: '2024-06-08',
    weight_kg: 4.15, note: null, source_type: 'manual',
    created_at: '2024-06-08T09:00:00',
  },
  {
    id: 'wt-03', pet_id: mockPetId, measured_at: '2024-06-15T09:00:00', local_date: '2024-06-15',
    weight_kg: 4.18, note: 'Post vet visit', source_type: 'manual',
    created_at: '2024-06-15T09:00:00',
  },
];
