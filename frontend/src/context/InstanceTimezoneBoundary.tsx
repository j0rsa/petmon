import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { infoApi } from '../api/info';
import { InstanceTimezoneContext } from './InstanceTimezoneContext';
import { StandaloneSessionBoundary } from './StandaloneSessionBoundary';

export function StandaloneApplicationBoundary({ children }: { children: ReactNode }) {
  return <StandaloneSessionBoundary><InstanceTimezoneBoundary>{children}</InstanceTimezoneBoundary></StandaloneSessionBoundary>;
}

/** Lives below authentication and the session cache boundary, above all care
 * pages. Never initialize a form with the browser timezone while loading. */
export function InstanceTimezoneBoundary({ children }: { children: ReactNode }) {
  const info = useQuery({ queryKey: ['app-info'], queryFn: infoApi.get, staleTime: Infinity });
  if (info.isPending) return <div className="loading-state">Loading instance timezone…</div>;
  let timezone = info.data?.timezone;
  if (timezone) {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
    catch { timezone = undefined; }
  }
  if (info.isError || !timezone) {
    return <div className="error-state" role="alert">
      <p>Unable to load a valid instance timezone. Care forms are unavailable until it is restored.</p>
      <button className="button" disabled={info.isFetching} onClick={() => { void info.refetch(); }}>Retry</button>
    </div>;
  }
  return <InstanceTimezoneContext.Provider key={timezone} value={timezone}>{children}</InstanceTimezoneContext.Provider>;
}
