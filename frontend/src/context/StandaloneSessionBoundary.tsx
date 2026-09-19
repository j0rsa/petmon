import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getStoredToken, SESSION_CHANGED_EVENT } from '../lib/auth';

let observedToken: string | null | undefined;
let revision = 0;

function snapshot() {
  const token = getStoredToken();
  if (token !== observedToken) {
    observedToken = token;
    revision += 1;
  }
  return revision;
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(SESSION_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SESSION_CHANGED_EVENT, onChange);
  };
}

/** Protect cache and editor state in other tabs and during device-token changes.
 * Kept below AuthGuard so the callback route cannot restart its PKCE exchange. */
export function StandaloneSessionBoundary({ children }: { children: ReactNode }) {
  const key = useSyncExternalStore(subscribe, snapshot, () => 0);
  return <Session key={key}>{children}</Session>;
}

function Session({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true } } }));
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
