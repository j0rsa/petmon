import { api } from './client';

export interface AppInfo {
  version: string;
  git_sha: string;
}

export const infoApi = {
  get: () => api.get<AppInfo>('/info'),
};
