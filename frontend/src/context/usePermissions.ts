import { useQuery } from '@tanstack/react-query';
import { meApi } from '../api/me';

export interface Permissions {
  /** True once the me query has resolved. */
  loaded: boolean;
  /** May read data — GET endpoints. */
  canRead: boolean;
  /** May mutate data — POST / PATCH / DELETE endpoints. */
  canWrite: boolean;
  /** May use the MCP tool endpoint. */
  canMcp: boolean;
}

function scopesToPermissions(scopes: string[], kind: string): Permissions {
  // OIDC and dev identities always have full access regardless of scopes.
  if (kind === 'oidc' || kind === 'dev') {
    return { loaded: true, canRead: true, canWrite: true, canMcp: true };
  }
  const s = new Set(scopes);
  const all = s.has('all');
  return {
    loaded: true,
    canRead: all || s.has('api_read'),
    canWrite: all || s.has('api_write'),
    canMcp: all || s.has('mcp'),
  };
}

export function usePermissions(): Permissions {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: meApi.get,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!me) {
    // Not loaded yet — optimistically allow everything to avoid flash of hidden UI.
    return { loaded: false, canRead: true, canWrite: true, canMcp: true };
  }

  return scopesToPermissions(me.scopes ?? [], me.kind);
}
