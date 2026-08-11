import { api } from './client';

export interface AppInfo {
  version: string;
  git_sha: string;
  demo_mode: boolean;
}

export const infoApi = {
  get: () => api.get<AppInfo>('/info'),
};
