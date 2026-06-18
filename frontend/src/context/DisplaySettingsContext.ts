import { createContext } from 'react';
import type { DisplaySettings } from '../api/settings';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
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

export const DisplaySettingsContext = createContext<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
