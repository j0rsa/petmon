import type { CalendarDisplayConfig } from '../lib/nutritionMetrics';
import type { NutritionCalendarSettings, WeekStart } from './userSettings';

export function nutritionCalendarToDisplayConfig(settings: NutritionCalendarSettings): CalendarDisplayConfig {
  return {
    calendar_show_wet_food: settings.show_wet_food,
    calendar_show_liquids: settings.show_liquids,
    calendar_show_water: settings.show_water,
    calendar_show_dry_food: settings.show_dry_food,
    calendar_show_record_count: settings.show_record_count,
    calendar_show_total_fluid: settings.show_total_fluid,
  };
}

export function weekStartFromSettings(settings: NutritionCalendarSettings): WeekStart {
  return settings.week_start;
}
