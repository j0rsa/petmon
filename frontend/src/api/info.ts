import { api } from './client';

export interface AppInfo {
  version: string;
  base_version?: string;
  edition?: string;
  features?: string[];
  git_sha: string;
  demo_mode: boolean;
  med_intake_shortcut_icloud_url?: string;
}

export const infoApi = {
  get: () => api.get<AppInfo>('/info'),
};
