import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type WidgetSettingsKey = 'nutrition_calendar' | 'cumulative_fluid_chart';

export type WeekStart = 'sunday' | 'monday';

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

export type WidgetSettingsMap = {
  nutrition_calendar: NutritionCalendarSettings;
  cumulative_fluid_chart: CumulativeFluidChartSettings;
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

export const WIDGET_SETTINGS_DEFAULTS: WidgetSettingsMap = {
  nutrition_calendar: DEFAULT_NUTRITION_CALENDAR_SETTINGS,
  cumulative_fluid_chart: DEFAULT_CUMULATIVE_FLUID_CHART_SETTINGS,
};

export const userSettingsApi = {
  getWidget: <K extends WidgetSettingsKey>(key: K) =>
    api.get<WidgetSettingsMap[K]>(`/me/widget-settings/${key}`),

  updateWidget: <K extends WidgetSettingsKey>(key: K, body: Partial<WidgetSettingsMap[K]>) =>
    api.post<WidgetSettingsMap[K]>(`/me/widget-settings/${key}`, body),
};

export function widgetSettingsQueryKey(key: WidgetSettingsKey) {
  return ['user-widget-settings', key] as const;
}

export function useUserWidgetSettings<K extends WidgetSettingsKey>(key: K) {
  const queryClient = useQueryClient();
  const queryKey = widgetSettingsQueryKey(key);

  const query = useQuery({
    queryKey,
    queryFn: () => userSettingsApi.getWidget(key),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<WidgetSettingsMap[K]>) => userSettingsApi.updateWidget(key, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
  });

  const settings = query.data ?? WIDGET_SETTINGS_DEFAULTS[key];

  function update(patch: Partial<WidgetSettingsMap[K]>) {
    mutation.mutate(patch);
  }

  return { settings, update, isLoading: query.isLoading, isSaving: mutation.isPending, error: mutation.error ?? query.error };
}
