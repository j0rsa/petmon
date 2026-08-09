import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { eliminationApi, type EliminationDurationDist } from '../../api/elimination';

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function durationLabel(dist: EliminationDurationDist | null | undefined, label: string): string {
  if (!dist) return `${label}: no history yet`;
  return `${label}: ~${fmtDuration(dist.median)} · ${dist.n} record${dist.n === 1 ? '' : 's'}`;
}

interface PetEliminationAutoTagBucketsProps {
  petId: string;
}

/** Classifier status and baselines shown when auto-tag is enabled for a pet. */
export function PetEliminationAutoTagBuckets({ petId }: PetEliminationAutoTagBucketsProps) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['elimination-classifier-status', petId],
    queryFn: () => eliminationApi.classifierStatus(petId),
  });

  const retrainMutation = useMutation({
    mutationFn: () => eliminationApi.classifierRetrain(petId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['elimination-classifier-status', petId] });
    },
  });

  if (statusQuery.isLoading) {
    return <p className="pet-elimination-auto-tag pet-elimination-auto-tag--loading">Loading auto-tag model…</p>;
  }

  const baselines = statusQuery.data?.baselines;
  const model = statusQuery.data?.model;
  const fallback = statusQuery.data?.fallback_active ?? true;

  return (
    <div className="pet-elimination-auto-tag">
      <span>
        Typical day: ~{baselines?.p50_wees_per_day.toFixed(0) ?? '?'} wees, ~{baselines?.p50_poops_per_day.toFixed(0) ?? '?'} poops
      </span>
      <span>{durationLabel(baselines?.wee_duration, 'Wee duration')}</span>
      <span>{durationLabel(baselines?.poop_duration, 'Poop duration')}</span>
      {model ? (
        <span>
          Model: {model.sample_count} visits
          {model.metrics ? ` · ${Math.round(model.metrics.accuracy * 100)}% accuracy` : ''}
        </span>
      ) : (
        <span>{fallback ? 'Using duration buckets until enough labeled visits (4+ wee & 4+ poop)' : 'Model not trained yet'}</span>
      )}
      <button
        type="button"
        className="button button-secondary pet-elimination-auto-tag__retrain"
        disabled={retrainMutation.isPending}
        onClick={() => retrainMutation.mutate()}
      >
        {retrainMutation.isPending ? 'Retraining…' : 'Retrain now'}
      </button>
      {retrainMutation.data && !retrainMutation.data.trained && (
        <span className="pet-elimination-auto-tag__message">{retrainMutation.data.message}</span>
      )}
    </div>
  );
}
