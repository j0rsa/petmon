import { api } from './client';

export interface MeResponse {
  subject: string;
  email: string | null;
  name: string | null;
  display_name: string;
  kind: 'oidc' | 'api_token' | 'dev';
  /** Granted scopes. Empty means full access (no restriction). */
  scopes: string[];
  roles?: string[];
  capabilities?: string[];
  /** Creator display name for the API token session (api_token kind only). */
  token_created_by?: string | null;
}

export const meApi = {
  get: (signal?: AbortSignal) => api.get<MeResponse>('/auth/me', signal),
};
