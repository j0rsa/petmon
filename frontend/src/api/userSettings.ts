import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type UserSettingsKey = 'display' | 'nutrition_calendar' | 'cumulative_fluid_chart' | 'developer_mode' | 'med_nudge';

/** @deprecated Use UserSettingsKey */
export type WidgetSettingsKey = Exclude<UserSettingsKey, 'display'>;

export type WeekStart = 'sunday' | 'monday';
export type TimeFormat = 'h24' | 'h12';
export type DateFormat = 'dmy' | 'mmm_dd_yyyy';

/** Per-user display preferences (time/date formatting, page toggles). */
export interface UserDisplaySettings {
  time_format: TimeFormat;
  date_format: DateFormat;
  show_water_card: boolean;
}

export interface NutritionCalendarSettings {
  week_start: WeekStart;
  show_wet_food: boolean;
  show_liquids: boolean;
  show_water: boolean;
  show_dry_food: boolean;
  show_record_count: boolean;
  show_total_fluid: boolean;
}

export interface CumulativeFluidChartSettings {
  show_current_liquids: boolean;
  show_current_food_fluid: boolean;
  show_current_total: boolean;
  show_best_day_liquids: boolean;
  show_best_day_food_fluid: boolean;
  show_best_day_total: boolean;
  show_schedule: boolean;
  show_now_bar: boolean;
}

/** Per-user developer tooling (curl snippets, etc.). */
export interface DeveloperModeSettings {
  enabled: boolean;
}

export interface NudgeSlot {
  enabled: boolean;
  /** Hour of day 0–23 by which the dose should have been logged. */
  deadline_hour: number;
}

export interface PetNudgeSchedule {
  morning: NudgeSlot;
  midday: NudgeSlot;
  evening: NudgeSlot;
}

/** Per-user medication nudge settings, keyed by pet_id. */
export interface MedNudgeSettings {
  pets: Record<string, PetNudgeSchedule>;
}

export type UserSettingsMap = {
  display: UserDisplaySettings;
  nutrition_calendar: NutritionCalendarSettings;
  cumulative_fluid_chart: CumulativeFluidChartSettings;
  developer_mode: DeveloperModeSettings;
  med_nudge: MedNudgeSettings;
};

export const DEFAULT_USER_DISPLAY_SETTINGS: UserDisplaySettings = {
  time_format: 'h24',
  date_format: 'dmy',
  show_water_card: true,
};

export const DEFAULT_NUTRITION_CALENDAR_SETTINGS: NutritionCalendarSettings = {
  week_start: 'sunday',
  show_wet_food: true,
  show_liquids: true,
  show_water: true,
  show_dry_food: true,
  show_record_count: true,
  show_total_fluid: true,
};

export const DEFAULT_CUMULATIVE_FLUID_CHART_SETTINGS: CumulativeFluidChartSettings = {
  show_current_liquids: true,
  show_current_food_fluid: false,
  show_current_total: false,
  show_best_day_liquids: true,
  show_best_day_food_fluid: false,
  show_best_day_total: false,
  show_schedule: true,
  show_now_bar: true,
};

export const DEFAULT_DEVELOPER_MODE_SETTINGS: DeveloperModeSettings = {
  enabled: false,
};

export const DEFAULT_NUDGE_SLOT: NudgeSlot = { enabled: false, deadline_hour: 9 };

export const DEFAULT_PET_NUDGE_SCHEDULE: PetNudgeSchedule = {
  morning: { enabled: false, deadline_hour: 9 },
  midday: { enabled: false, deadline_hour: 13 },
  evening: { enabled: false, deadline_hour: 20 },
};

export const DEFAULT_MED_NUDGE_SETTINGS: MedNudgeSettings = { pets: {} };

export const USER_SETTINGS_DEFAULTS: UserSettingsMap = {
  display: DEFAULT_USER_DISPLAY_SETTINGS,
  nutrition_calendar: DEFAULT_NUTRITION_CALENDAR_SETTINGS,
  cumulative_fluid_chart: DEFAULT_CUMULATIVE_FLUID_CHART_SETTINGS,
  developer_mode: DEFAULT_DEVELOPER_MODE_SETTINGS,
  med_nudge: DEFAULT_MED_NUDGE_SETTINGS,
};

export const userSettingsApi = {
  get: <K extends UserSettingsKey>(key: K) =>
    api.get<UserSettingsMap[K]>(`/me/settings/${key}`),

  update: <K extends UserSettingsKey>(key: K, body: Partial<UserSettingsMap[K]>) =>
    api.post<UserSettingsMap[K]>(`/me/settings/${key}`, body),
};

export function userSettingsQueryKey(key: UserSettingsKey) {
  return ['user-settings', key] as const;
}

export function useUserSettings<K extends UserSettingsKey>(key: K) {
  const queryClient = useQueryClient();
  const queryKey = userSettingsQueryKey(key);

  const query = useQuery({
    queryKey,
    queryFn: () => userSettingsApi.get(key),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<UserSettingsMap[K]>) => userSettingsApi.update(key, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
  });

  const settings = query.data ?? USER_SETTINGS_DEFAULTS[key];

  function update(patch: Partial<UserSettingsMap[K]>) {
    mutation.mutate(patch);
  }

  return { settings, update, isLoading: query.isLoading, isSaving: mutation.isPending, error: mutation.error ?? query.error };
}

/** Widget-only alias — calendar and chart gear controls. */
export function useUserWidgetSettings<K extends WidgetSettingsKey>(key: K) {
  return useUserSettings(key);
}

export function widgetSettingsQueryKey(key: WidgetSettingsKey) {
  return userSettingsQueryKey(key);
}
