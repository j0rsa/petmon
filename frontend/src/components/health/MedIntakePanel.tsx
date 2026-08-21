import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  medicationsApi,
  type CreateMedIntakeRecord,
  type DailyMedAssignment,
  type DoseFraction,
} from '../../api/medications';
import { localToday } from '../../lib/dates';
import {
  expectedDoseCount,
  DOSE_FRACTIONS,
  doseFractionLabel,
  formatFrequency,
  intakeStatus,
  intakeStatusLabel,
} from '../../lib/medications';
import { isDoseSupported } from '../../lib/pillDoseCuts';
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
  const expected = expectedDoseCount(assignment.frequency);
  const status = intakeStatus(item.intakes, expected);
  const [showDosePrompt, setShowDosePrompt] = useState(false);
  const [doseFraction, setDoseFraction] = useState<DoseFraction>('whole');
  const [liquidDoseMl, setLiquidDoseMl] = useState('');

  const logMutation = useMutation({
    mutationFn: (payload: CreateMedIntakeRecord) => medicationsApi.createIntake(payload),
    onSuccess: onLogged,
  });

  const undoMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.deleteIntake(id),
    onSuccess: onLogged,
  });

  function logIntake(overrides: Partial<CreateMedIntakeRecord> = {}) {
    logMutation.mutate({
      pet_id: petId,
      medication_id: medication.id,
      assignment_id: assignment.id,
      taken: true,
      ...overrides,
    }, {
      onSuccess: () => {
        setShowDosePrompt(false);
        setLiquidDoseMl('');
      },
    });
  }

  function handleTake() {
    if (assignment.optional) {
      setShowDosePrompt(true);
      return;
    }
    logIntake();
  }

  function confirmOptionalDose() {
    if (medication.med_type === 'pill') {
      logIntake({ dose_fraction_override: doseFraction });
      return;
    }
    const ml = Number.parseFloat(liquidDoseMl);
    if (Number.isFinite(ml) && ml > 0) {
      logIntake({ liquid_dose_ml_override: ml });
    }
  }

  const lastIntake = [...item.intakes]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

  const iconFraction = assignment.optional ? 'whole' : assignment.dose_fraction;
  const iconShape = assignment.formulation.pill_shape;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
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
          {assignment.optional
            ? 'As needed · Choose dosage when taken'
            : `${assignment.dose_label} · ${formatFrequency(assignment.frequency)}`}
        </p>
        {item.intakes.length > 0 && (
          <p className="muted-text" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
            {item.intakes.map((i) => `Taken ${formatTime(i.occurred_at)} (${i.dose_label})`).join(' · ')}
          </p>
        )}
      </div>
      {canWrite && (
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {(assignment.optional || status !== 'done') && (
            <button
              type="button"
              className="button"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
              disabled={logMutation.isPending}
              onClick={handleTake}
            >
              Take
            </button>
          )}
          {lastIntake && (
            <button
              type="button"
              className="button button-secondary"
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
              disabled={undoMutation.isPending}
              onClick={() => undoMutation.mutate(lastIntake.id)}
            >
              Undo
            </button>
          )}
        </div>
      )}
      {showDosePrompt && (
        <div
          style={{
            flexBasis: '100%',
            marginLeft: '3.25rem',
            padding: '0.65rem',
            borderRadius: 8,
            background: 'var(--surface-muted)',
          }}
        >
          <strong style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.45rem' }}>
            Dosage taken
          </strong>
          {medication.med_type === 'pill' ? (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {DOSE_FRACTIONS.map((fraction) => {
                const supported = isDoseSupported(assignment.formulation.pill_shape ?? 'round', fraction);
                return (
                  <button
                    key={fraction}
                    type="button"
                    className={`button${doseFraction === fraction ? '' : ' button-secondary'}`}
                    disabled={!supported}
                    style={{ padding: '0.3rem 0.55rem', fontSize: '0.78rem' }}
                    onClick={() => setDoseFraction(fraction)}
                  >
                    {doseFractionLabel(fraction)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="form-row" style={{ maxWidth: '10rem' }}>
              <label style={{ fontSize: '0.78rem' }}>Amount (ml)</label>
              <input
                type="number"
                min="0.01"
                step="0.1"
                inputMode="decimal"
                value={liquidDoseMl}
                placeholder="e.g. 0.6"
                autoFocus
                onChange={(event) => setLiquidDoseMl(event.target.value)}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.55rem' }}>
            <button
              type="button"
              className="button"
              disabled={
                logMutation.isPending
                || (medication.med_type === 'liquid'
                  && !(Number.parseFloat(liquidDoseMl) > 0))
              }
              onClick={confirmOptionalDose}
            >
              Confirm
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setShowDosePrompt(false)}
            >
              Cancel
            </button>
          </div>
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
          No medications are due today.
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
