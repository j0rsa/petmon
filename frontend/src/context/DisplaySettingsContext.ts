import { createContext } from 'react';
import type { DisplaySettings } from '../api/settings';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  time_format: 'h24',
  date_format: 'dmy',
  show_water_card: true,
};

export const DisplaySettingsContext = createContext<DisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
