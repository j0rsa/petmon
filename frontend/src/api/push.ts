import { api } from './client';

export interface PushConfig {
  enabled: boolean;
  public_key: string | null;
}

export interface PushSubscribeBody {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushTestResult {
  sent: number;
  failed: number;
  error?: string | null;
}

export const pushApi = {
  getConfig: () => api.get<PushConfig>('/push/config'),
  subscribe: (body: PushSubscribeBody) => api.post<void>('/push/subscribe', body),
  unsubscribe: (endpoint: string) => api.post<void>('/push/unsubscribe', { endpoint }),
  sendTest: (endpoint: string) => api.post<PushTestResult>('/push/test', { endpoint }),
};
