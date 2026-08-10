import { createContext } from 'react';
import type { UserDisplaySettings } from '../api/userSettings';

export const DEFAULT_DISPLAY_SETTINGS: UserDisplaySettings = {
  time_format: 'h24',
  date_format: 'dmy',
  show_water_card: true,
};

export const DisplaySettingsContext = createContext<UserDisplaySettings>(DEFAULT_DISPLAY_SETTINGS);
