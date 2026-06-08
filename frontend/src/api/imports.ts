import { api } from './client';
import type { ImportBatch, ImportPreview } from '../types';

export const importsApi = {
  preview: (data: { source_name: string; raw_text: string; cat_id: string }) => api.post<ImportPreview>('/imports/preview', data),
  commit: (data: { source_name: string; raw_text: string; cat_id: string }) => api.post<ImportBatch>('/imports/commit', data),
  list: () => api.get<ImportBatch[]>('/imports'),
  get: (id: string) => api.get<ImportBatch>(`/imports/${id}`),
};
