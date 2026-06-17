import { api } from './client';

export interface OidcConfigPublic {
  enabled: boolean;
  issuer_url: string | null;
  client_id: string | null;
}

export interface UpdateOidcConfig {
  enabled?: boolean;
  issuer_url?: string | null;
  client_id?: string | null;
}

export interface TelegramConfigPublic {
  enabled: boolean;
  has_bot_token: boolean;
}

export interface UpdateTelegramConfig {
  enabled?: boolean;
  bot_token?: string | null;
}

export interface ApiTokenPublic {
  id: string;
  alias: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface ApiTokenCreated {
  id: string;
  alias: string | null;
  token: string;
  created_at: string;
}

export interface CreateApiToken {
  alias?: string;
}

export const settingsApi = {
  getOidc: () => api.get<OidcConfigPublic>('/settings/oidc'),
  updateOidc: (body: UpdateOidcConfig) => api.post<OidcConfigPublic>('/settings/oidc', body),
  getTelegram: () => api.get<TelegramConfigPublic>('/settings/telegram'),
  updateTelegram: (body: UpdateTelegramConfig) => api.post<TelegramConfigPublic>('/settings/telegram', body),
  listTokens: () => api.get<ApiTokenPublic[]>('/api-tokens'),
  createToken: (body: CreateApiToken) => api.post<ApiTokenCreated>('/api-tokens', body),
  deactivateToken: (id: string) => api.delete(`/api-tokens/${id}`),
};
