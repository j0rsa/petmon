import { api } from './client';

export const authApi = {
  signOut: () => api.post<void>('/auth/sign-out', {}),
};
