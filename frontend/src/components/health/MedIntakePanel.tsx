import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { medicationsApi, type CreateMedIntakeRecord, type DailyMedAssignment } from '../../api/medications';
import { localToday } from '../../lib/dates';
import { formatFrequency, intakeStatus, intakeStatusLabel } from '../../lib/medications';
import { usePermissions } from '../../context/usePermissions';
import { useFormatTime } from '../../context/useDisplaySettings';
import { MedIcon } from './MedIcon';

export interface MedIntakePanelProps {
  petId: string;
}

function DailyMedRow({
  item,
  petId,
  canWrite,
  onLogged,
}: {
  item: DailyMedAssignment;
  petId: string;
  canWrite: boolean;
  onLogged: () => void;
}) {
  const formatTime = useFormatTime();
  const { medication, assignment } = item;
  const expected = Math.max(1, assignment.frequency.times.length);
  const status = intakeStatus(item.intakes, expected);

  const logMutation = useMutation({
    mutationFn: (payload: CreateMedIntakeRecord) => medicationsApi.createIntake(payload),
    onSuccess: onLogged,
  });

  function logIntake(taken: boolean) {
    logMutation.mutate({
      pet_id: petId,
      medication_id: medication.id,
      assignment_id: assignment.id,
      taken,
    });
  }

  const iconFraction = assignment.dose_fraction;
  const iconShape = assignment.formulation.pill_shape;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.65rem 0',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <MedIcon
        medType={medication.med_type}
        color={medication.color}
        pillShape={iconShape}
        doseFraction={iconFraction}
        size={40}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.92rem' }}>{medication.name}</strong>
          {assignment.optional && (
            <span className="muted-text" style={{ fontSize: '0.75rem' }}>Optional</span>
          )}
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.1rem 0.45rem',
              borderRadius: 999,
              background:
                status === 'done'
                  ? 'color-mix(in srgb, var(--accent) 18%, transparent)'
                  : status === 'skipped'
                    ? 'color-mix(in srgb, var(--danger) 15%, transparent)'
                    : 'var(--surface-muted)',
              color: 'var(--text-muted)',
            }}
          >
            {intakeStatusLabel(status)}
          </span>
        </div>
        <p className="muted-text" style={{ fontSize: '0.8rem', margin: '0.15rem 0 0' }}>
          {assignment.dose_label} · {formatFrequency(assignment.frequency.times)}
        </p>
        {item.intakes.length > 0 && (
          <p className="muted-text" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
            {item.intakes.map((i) => `${i.taken ? 'Taken' : 'Skipped'} ${formatTime(i.occurred_at)} (${i.dose_label})`).join(' · ')}
          </p>
        )}
      </div>
      {canWrite && status !== 'done' && (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          <button
            type="button"
            className="button"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
            disabled={logMutation.isPending}
            onClick={() => logIntake(true)}
          >
            Taken
          </button>
          <button
            type="button"
            className="button button-secondary"
            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
            disabled={logMutation.isPending}
            onClick={() => logIntake(false)}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

export function MedIntakePanel({ petId }: MedIntakePanelProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const today = localToday();

  const dailyQuery = useQuery({
    queryKey: ['med-daily', petId, today],
    queryFn: () => medicationsApi.dailyAssignments(petId, today),
    enabled: Boolean(petId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['med-daily', petId] });
    queryClient.invalidateQueries({ queryKey: ['med-intake'] });
  }

  const items = dailyQuery.data ?? [];

  return (
    <section className="panel" id="medications">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Medications</p>
          <h3>Today&apos;s meds</h3>
        </div>
      </div>

      {dailyQuery.isPending ? (
        <div className="loading-state">Loading…</div>
      ) : items.length === 0 ? (
        <p className="muted-text" style={{ fontSize: '0.88rem' }}>
          No active medications for today. Add a treatment plan on the Treatment plan tab.
        </p>
      ) : (
        <div>
          {items.map((item) => (
            <DailyMedRow
              key={item.medication.id}
              item={item}
              petId={petId}
              canWrite={canWrite}
              onLogged={invalidate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
