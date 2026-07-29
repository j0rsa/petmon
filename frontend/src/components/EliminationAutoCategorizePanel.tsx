import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eliminationApi, type EliminationDurationProfile } from '../api/elimination';
import { petsApi } from '../api/pets';
import { usePermissions } from '../context/usePermissions';
import type { Pet } from '../types';

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function bucketLabel(bucket: EliminationDurationProfile['wee'], label: string): string {
  if (!bucket) return `${label}: no history yet`;
  const ready = bucket.sample_count >= 2 ? '' : ' (needs 2+ samples)';
  return `${label}: ~${fmtDuration(bucket.avg_duration_seconds)} · ${bucket.sample_count} record${bucket.sample_count === 1 ? '' : 's'}${ready}`;
}

interface AutoCategorizePanelProps {
  pet: Pet;
}

export function AutoCategorizePanel({ pet }: AutoCategorizePanelProps) {
  const { canWrite } = usePermissions();
  const queryClient = useQueryClient();
  const enabled = pet.elimination_auto_categorize_by_duration ?? false;

  const profileQuery = useQuery({
    queryKey: ['elimination-duration-profile', pet.id],
    queryFn: () => eliminationApi.durationProfile(pet.id),
    enabled,
  });

  const mutation = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      petsApi.update(pet.id, { elimination_auto_categorize_by_duration: nextEnabled }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Pet[]>(['pets'], (existing) =>
        existing?.map((p) => (p.id === updated.id ? updated : p)) ?? existing,
      );
    },
  });

  return (
    <section className="panel" style={{ marginBottom: '0.75rem' }}>
      <div className="display-option-row">
        <div>
          <span className="display-option-label">Auto-tag by duration</span>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            General visits with a logged duration are tagged as Wee or Poop when they match this pet&apos;s history.
          </p>
        </div>
        <div className="display-option-choices">
          <label className="checkbox-row" style={{ paddingTop: 0 }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canWrite || mutation.isPending}
              onChange={(e) => mutation.mutate(e.target.checked)}
            />
            Enabled
          </label>
        </div>
      </div>

      {enabled && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {profileQuery.isLoading ? (
            <span>Loading duration history…</span>
          ) : (
            <>
              <span>{bucketLabel(profileQuery.data?.wee ?? null, 'Wee bucket')}</span>
              <span>{bucketLabel(profileQuery.data?.poo ?? null, 'Poop bucket')}</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
