import { api } from './client';

export interface MeResponse {
  subject: string;
  email: string | null;
  name: string | null;
  display_name: string;
  kind: 'oidc' | 'api_token' | 'dev';
}

export const meApi = {
  get: () => api.get<MeResponse>('/auth/me'),
};
