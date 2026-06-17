import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../api/settings';
import { DEFAULT_DISPLAY_SETTINGS, DisplaySettingsContext } from './DisplaySettingsContext';

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ['settings-display'],
    queryFn: settingsApi.getDisplay,
    staleTime: Infinity,
  });

  return (
    <DisplaySettingsContext.Provider value={data ?? DEFAULT_DISPLAY_SETTINGS}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}
