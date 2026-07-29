import { useQuery } from '@tanstack/react-query';
import { eliminationApi, type EliminationDurationProfile } from '../../api/elimination';

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

interface PetEliminationAutoTagBucketsProps {
  petId: string;
}

/** Duration bucket summary shown when auto-tag is enabled for a pet. */
export function PetEliminationAutoTagBuckets({ petId }: PetEliminationAutoTagBucketsProps) {
  const profileQuery = useQuery({
    queryKey: ['elimination-duration-profile', petId],
    queryFn: () => eliminationApi.durationProfile(petId),
  });

  if (profileQuery.isLoading) {
    return <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>Loading duration history…</p>;
  }

  return (
    <div
      style={{
        marginTop: '0.5rem',
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
      }}
    >
      <span>{bucketLabel(profileQuery.data?.wee ?? null, 'Wee bucket')}</span>
      <span>{bucketLabel(profileQuery.data?.poo ?? null, 'Poop bucket')}</span>
    </div>
  );
}
