import { api } from './client';
import { SCOPES, type Scope } from './authTypes';
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

export function allowedTokenScopes(me: MeResponse | undefined): Scope[] {
  const scopes = effectiveScopes(me);
  return SCOPES.filter((scope) => scope === 'all'
    ? canDelegateAll(me)
    : scopes.has(scope));
}

export interface ApiTokenPublic {
  id: string;
  alias: string | null;
  active: boolean;
  current: boolean;
  scopes: Scope[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated {
  id: string;
  alias: string | null;
  token: string;
  scopes: Scope[];
  created_at: string;
}

export interface ApiTokenAdminPublic extends ApiTokenPublic {
  owner_subject: string | null;
}

export interface ApiTokenAdminPage {
  items: ApiTokenAdminPublic[];
  page: number;
  page_size: number;
  total_owners: number;
}

export interface ListInstanceTokensParams {
  page?: number;
  pageSize?: number;
  name?: string;
}

export interface RevokeTokensForOwnerResult {
  revoked: number;
}

export interface CreateApiToken {
  alias?: string;
  scopes?: Scope[];
}

export interface UpdateApiTokenScopes {
  scopes: Scope[];
}

export const settingsApi = {
  getOidc: () => api.get<OidcConfigPublic>('/settings/oidc'),
  updateOidc: (body: UpdateOidcConfig) => api.post<OidcConfigPublic>('/settings/oidc', body),
  getTelegram: () => api.get<TelegramConfigPublic>('/settings/telegram'),
  updateTelegram: (body: UpdateTelegramConfig) => api.post<TelegramConfigPublic>('/settings/telegram', body),
  listTokens: () => api.get<ApiTokenPublic[]>('/api-tokens'),
  listInstanceTokens: ({ page = 1, pageSize = 10, name }: ListInstanceTokensParams = {}) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (name) params.set('name', name);
    return api.get<ApiTokenAdminPage>(`/admin/api-tokens?${params}`);
  },
  revokeInstanceToken: (id: string) => api.delete(`/admin/api-tokens/${id}`),
  activateInstanceToken: (id: string) => api.post<void>(`/admin/api-tokens/${id}/activate`, {}),
  revokeInstanceTokensForOwner: (owner_subject: string) =>
    api.post<RevokeTokensForOwnerResult>('/admin/api-tokens/revoke-owner', { owner_subject }),
  createToken: (body: CreateApiToken) => api.post<ApiTokenCreated>('/api-tokens', body),
  deactivateToken: (id: string) => api.delete(`/api-tokens/${id}`),
  deleteToken: (id: string) => api.delete(`/api-tokens/${id}/permanent`),
  updateTokenScopes: (id: string, body: UpdateApiTokenScopes) =>
    api.patch<ApiTokenPublic>(`/api-tokens/${id}/scopes`, body),
};
