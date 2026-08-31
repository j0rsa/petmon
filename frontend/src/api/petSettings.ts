import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type PetSettingsKey = 'med_nudge';

export interface NudgeSlot {
  enabled: boolean;
  /** Hour of day 0–23 by which the dose should have been logged. */
  deadline_hour: number;
}

export interface PetNudgeSchedule {
  morning: NudgeSlot;
  midday: NudgeSlot;
  evening: NudgeSlot;
}

export type PetSettingsMap = {
  med_nudge: PetNudgeSchedule;
};

export const DEFAULT_NUDGE_SLOT: NudgeSlot = { enabled: false, deadline_hour: 9 };

export const DEFAULT_PET_NUDGE_SCHEDULE: PetNudgeSchedule = {
  morning: { enabled: false, deadline_hour: 9 },
  midday: { enabled: false, deadline_hour: 13 },
  evening: { enabled: false, deadline_hour: 20 },
};

export const PET_SETTINGS_DEFAULTS: PetSettingsMap = {
  med_nudge: DEFAULT_PET_NUDGE_SCHEDULE,
};

export const petSettingsApi = {
  get: <K extends PetSettingsKey>(petId: string, key: K) =>
    api.get<PetSettingsMap[K]>(`/pets/${petId}/settings/${key}`),
  update: <K extends PetSettingsKey>(petId: string, key: K, body: PetSettingsMap[K]) =>
    api.post<PetSettingsMap[K]>(`/pets/${petId}/settings/${key}`, body),
};

export function petSettingsQueryKey(petId: string, key: PetSettingsKey) {
  return ['pet-settings', petId, key] as const;
}

export function usePetSettings<K extends PetSettingsKey>(petId: string | undefined, key: K) {
  const queryClient = useQueryClient();
  const queryKey = petId ? petSettingsQueryKey(petId, key) : (['pet-settings-disabled'] as const);

  const query = useQuery({
    queryKey,
    queryFn: () => petSettingsApi.get(petId!, key),
    enabled: Boolean(petId),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (value: PetSettingsMap[K]) => petSettingsApi.update(petId!, key, value),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
    },
  });

  const settings = query.data ?? PET_SETTINGS_DEFAULTS[key];

  return {
    settings,
    update: (value: PetSettingsMap[K]) => mutation.mutate(value),
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    error: mutation.error ?? query.error,
  };
}
