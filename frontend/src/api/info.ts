import { api } from './client';

export interface AppInfo {
  version: string;
  git_sha: string;
  demo_mode: boolean;
  med_intake_shortcut_icloud_url?: string;
  med_intake_automate_community_url?: string;
}

export const infoApi = {
  get: () => api.get<AppInfo>('/info'),
};
