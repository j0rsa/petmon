import { useQuery } from '@tanstack/react-query';
import { useApplicationExtensions, useSessionMe, type ResourcePermissions } from './ApplicationExtensions';
import { useOptionalSelectedPet } from './SelectedPetContext';
import type { MeResponse } from '../api/me';

export interface Permissions {
  /** True once identity and resource permission checks have settled. */
  loaded: boolean;
  /** May read data — GET endpoints. */
  canRead: boolean;
  /** May mutate data — POST / PATCH / DELETE endpoints. */
  canWrite: boolean;
  /** May use the MCP tool endpoint. */
  canMcp: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canWriteProfile: boolean;
  canManageIntegrations: boolean;
  canChangeStatus: boolean;
  canAdminRead: boolean;
  canAdminWrite: boolean;
}

export function effectiveCapabilities(me: MeResponse | undefined): Set<string> {
  if (!me) return new Set();
  if (me.capabilities) return new Set(me.capabilities);
  const scopes = new Set(me.scopes);
  // Compatibility for older servers; administrative capability is never inferred.
  if (me.scopes.length === 0 || scopes.has('all') || me.kind === 'dev') return new Set(['api_read', 'api_write', 'mcp']);
  return new Set([...scopes].filter((scope) => scope !== 'instance_admin'));
}

const standalone: ResourcePermissions = { view: true, writeRecords: true, writeProfile: true, manageIntegrations: true, create: true, delete: true, changeStatus: true };

/** Omit petId for selected-pet controls, pass an actual ID for direct links,
 * and null for collection/global operations. */
export function usePermissions(petId?: string | null): Permissions {
  const identity = useSessionMe();
  const me = identity.isError ? undefined : identity.data;
  const extensions = useApplicationExtensions();
  const selected = useOptionalSelectedPet();
  const resourceId = petId === undefined ? selected?.selectedPetId ?? null : petId;
  const policy = useQuery({
    queryKey: ['resource-permissions', resourceId],
    queryFn: ({ signal }) => extensions!.permissions!(resourceId, signal),
    enabled: !!me && !!extensions?.permissions,
    staleTime: 0,
    retry: false,
  });
  const resource = extensions ? (policy.isError ? undefined : policy.data) : standalone;
  const caps = effectiveCapabilities(me);
  const read = caps.has('api_read');
  const write = caps.has('api_write');
  return {
    loaded: identity.isError || (!!me && (!extensions || policy.isFetched)),
    canRead: read && !!resource?.view,
    canWrite: write && !!resource?.writeRecords,
    canMcp: caps.has('mcp'),
    canCreate: write && !!resource?.create,
    canDelete: write && !!resource?.delete,
    canWriteProfile: write && !!resource?.writeProfile,
    canManageIntegrations: write && !!resource?.manageIntegrations,
    canChangeStatus: write && !!resource?.changeStatus,
    canAdminRead: read && caps.has('instance_admin'),
    canAdminWrite: write && caps.has('instance_admin'),
  };
}
