import { useQuery } from '@tanstack/react-query';
import { DEFAULT_USER_DISPLAY_SETTINGS, userSettingsApi, userSettingsQueryKey } from '../api/userSettings';
import { DEFAULT_DISPLAY_SETTINGS, DisplaySettingsContext } from './DisplaySettingsContext';

export function DisplaySettingsProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: userSettingsQueryKey('display'),
    queryFn: () => userSettingsApi.get('display'),
    staleTime: Infinity,
  });

  return (
    <DisplaySettingsContext.Provider value={data ?? DEFAULT_DISPLAY_SETTINGS}>
      {children}
    </DisplaySettingsContext.Provider>
  );
}

export { DEFAULT_USER_DISPLAY_SETTINGS };
