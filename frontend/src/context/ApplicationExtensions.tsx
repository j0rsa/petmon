import { createContext, useContext, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { meApi, type MeResponse } from '../api/me';
import type { PetProfilePayload } from '../api/pets';
import type { Pet } from '../types';

export type ResourceAction = 'view' | 'writeRecords' | 'writeProfile' | 'manageIntegrations' | 'create' | 'delete' | 'changeStatus';
export type ResourcePermissions = Record<ResourceAction, boolean>;

/** Shared App uses declarative routes, not React Router data-router loaders. */
export type ApplicationRoute =
  | { index: true; element: ReactNode; path?: never; children?: never }
  | { index?: false; path?: string; element: ReactNode; children?: ApplicationRoute[] };

export interface ApplicationExtensions {
  /** Change on account, credential, collection context, or authorization revision changes.
   * Each value owns a fresh query cache and component tree; never use a secret token as this key. */
  sessionKey: string;
  /** Ready user/session IANA timezone, independent of pet selection.
   * Required before rendering clock-dependent UI. Change sessionKey when it changes. */
  timezone?: string;
  /** Optional clock injection for deterministic render/query date defaults. */
  now?: () => Date;
  session?: {
    getMe: (signal: AbortSignal) => Promise<MeResponse>;
    signOut: () => Promise<void>;
    /** Optional opt-in for replacing this session with a newly minted device token. */
    installApiToken?: (token: string) => Promise<void>;
    /** Must render an Outlet after authenticating. */
    Guard: ComponentType;
  };
  routes?: ApplicationRoute[];
  navigation?: { to: string; label: string }[];
  chrome?: {
    sidebar?: ReactNode;
    beforeContent?: ReactNode;
    settings?: ReactNode;
    /** Optional content below the shared Manage pet profiles header. */
    petManagement?: ReactNode;
  };
  pets?: {
    /** Collection-specific query keys retain the ['pets'] invalidation prefix. */
    key: string;
    list: (signal: AbortSignal) => Promise<Pet[]>;
    create: (payload: PetProfilePayload & { name: string }) => Promise<Pet>;
    selection?: { id: string | null; setId: (id: string | null) => void };
    persistence?: { read: () => string | null; write: (id: string | null) => void };
  };
  /** Missing, pending, and failed decisions deny all actions. null is a collection/global operation. */
  permissions: (petId: string | null, signal: AbortSignal) => Promise<ResourcePermissions>;
}

const ExtensionsContext = createContext<ApplicationExtensions | null>(null);

/** Mount above all shared providers, including DisplaySettingsProvider and the router. */
export function ApplicationExtensionsProvider({ value, children }: { value: ApplicationExtensions; children: ReactNode }) {
  return <IsolatedSession key={value.sessionKey} value={value}>{children}</IsolatedSession>;
}

function IsolatedSession({ value, children }: { value: ApplicationExtensions; children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  useEffect(() => () => {
    // Cancellation makes late responses obsolete even when a transport ignores AbortSignal.
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <ExtensionsContext.Provider value={value}><QueryClientProvider client={client}>{children}</QueryClientProvider></ExtensionsContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApplicationExtensions() { return useContext(ExtensionsContext); }

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionMe() {
  const extensions = useApplicationExtensions();
  return useQuery({ queryKey: ['me'], queryFn: ({ signal }) => extensions?.session ? extensions.session.getMe(signal) : meApi.get(signal), staleTime: 30_000, retry: false });
}
