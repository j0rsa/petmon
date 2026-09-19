import { api } from './client';

export interface MeResponse {
  subject: string;
  email: string | null;
  name: string | null;
  display_name: string;
  kind: 'oidc' | 'api_token' | 'dev';
  /** Granted transport scopes. Legacy empty token scopes never grant instance-admin access. */
  scopes: string[];
  roles: string[];
  /** Creator display name for the API token session (api_token kind only). */
  token_created_by?: string | null;
}

/** REST and MCP scopes remain separate. Legacy empty scopes grant care access only. */
export function effectiveScopes(me: MeResponse | undefined): Set<string> {
  if (!me) return new Set();
  if (me.scopes.length === 0 || me.scopes.includes('all')) return new Set(['api_read', 'api_write', 'mcp']);
  return new Set(me.scopes.filter((scope) => ['api_read', 'api_write', 'mcp'].includes(scope)));
}

export function canDelegateAll(me: MeResponse | undefined): boolean {
  return !!me && (me.scopes.includes('all') || (me.kind !== 'api_token' && ['api_read', 'api_write', 'mcp'].every((scope) => effectiveScopes(me).has(scope))));
}

export function hasInstanceAdminAccess(me: MeResponse | undefined): boolean {
  return !!me?.roles?.includes('instance_admin') && (me.kind !== 'api_token' || me.scopes.includes('all'));
}

export const meApi = {
  get: (signal?: AbortSignal) => api.get<MeResponse>('/auth/me', signal),
};
