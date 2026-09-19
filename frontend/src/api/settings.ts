import { api } from './client';
import { canDelegateAll, effectiveScopes, type MeResponse } from './me';

export interface OidcConfigPublic {
  enabled: boolean;
  issuer_url: string | null;
  client_id: string | null;
  groups_claim: string | null;
  full_access_group: string | null;
  readonly_group: string | null;
}

export interface UpdateOidcConfig {
  enabled?: boolean;
  issuer_url?: string | null;
  client_id?: string | null;
  /** Pass null to clear (reverts to "groups" default). */
  groups_claim?: string | null;
  /** Pass null to remove restriction (all OIDC users get full access). */
  full_access_group?: string | null;
  /** Pass null to disable read-only group. */
  readonly_group?: string | null;
}

export interface TelegramConfigPublic {
  enabled: boolean;
  has_bot_token: boolean;
}

export interface UpdateTelegramConfig {
  enabled?: boolean;
  bot_token?: string | null;
}

export type ApiTokenScope = 'all' | 'api_read' | 'api_write' | 'mcp';
export const API_TOKEN_SCOPES: ApiTokenScope[] = ['all', 'api_read', 'api_write', 'mcp'];

export function allowedTokenScopes(me: MeResponse | undefined): ApiTokenScope[] {
  const scopes = effectiveScopes(me);
  return API_TOKEN_SCOPES.filter((scope) => scope === 'all'
    ? canDelegateAll(me)
    : scopes.has(scope));
}

export interface ApiTokenPublic {
  id: string;
  alias: string | null;
  active: boolean;
  current: boolean;
  scopes: ApiTokenScope[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated {
  id: string;
  alias: string | null;
  token: string;
  scopes: ApiTokenScope[];
  created_at: string;
}

export interface ApiTokenAdminPublic extends ApiTokenPublic {
  owner_subject: string | null;
}

export interface CreateApiToken {
  alias?: string;
  scopes?: ApiTokenScope[];
}

export interface UpdateApiTokenScopes {
  scopes: ApiTokenScope[];
}

export const settingsApi = {
  getOidc: () => api.get<OidcConfigPublic>('/settings/oidc'),
  updateOidc: (body: UpdateOidcConfig) => api.post<OidcConfigPublic>('/settings/oidc', body),
  getTelegram: () => api.get<TelegramConfigPublic>('/settings/telegram'),
  updateTelegram: (body: UpdateTelegramConfig) => api.post<TelegramConfigPublic>('/settings/telegram', body),
  listTokens: () => api.get<ApiTokenPublic[]>('/api-tokens'),
  listInstanceTokens: () => api.get<ApiTokenAdminPublic[]>('/admin/api-tokens'),
  revokeInstanceToken: (id: string) => api.delete(`/admin/api-tokens/${id}`),
  createToken: (body: CreateApiToken) => api.post<ApiTokenCreated>('/api-tokens', body),
  activateToken: (id: string) => api.post<void>(`/api-tokens/${id}/activate`, {}),
  deactivateToken: (id: string) => api.delete(`/api-tokens/${id}`),
  deleteToken: (id: string) => api.delete(`/api-tokens/${id}/permanent`),
  updateTokenScopes: (id: string, body: UpdateApiTokenScopes) =>
    api.patch<ApiTokenPublic>(`/api-tokens/${id}/scopes`, body),
};
