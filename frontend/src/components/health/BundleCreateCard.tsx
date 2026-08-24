import { useMemo, useState } from 'react';
import type { MedAssignment, Medication } from '../../api/medications';
import { defaultBundleName } from '../../lib/medications';

interface BundleCreateCardProps {
  assignments: MedAssignment[];
  medicationsById: Map<string, Medication>;
  saving: boolean;
  error: boolean;
  emptyHint: string;
  onCreate: (assignmentIds: string[], name: string) => void;
  onCancel: () => void;
}

export function BundleCreateCard({
  assignments,
  medicationsById,
  saving,
  error,
  emptyHint,
  onCreate,
  onCancel,
}: BundleCreateCardProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');

  const placeholder = useMemo(() => {
    const names = selectedIds.flatMap((id) => {
      const assignment = assignments.find((item) => item.id === id);
      const medication = assignment ? medicationsById.get(assignment.medication_id) : undefined;
      return medication?.name ? [medication.name] : [];
    });
    return defaultBundleName(names) || 'e.g. Morning meds';
  }, [assignments, medicationsById, selectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <article className="plan-entity plan-entity--editing">
      <div className="plan-entity__identity">
        <h4 className="plan-entity__name">New bundle</h4>
        <p className="muted-text" style={{ fontSize: '0.85rem', margin: 0 }}>
          Join scheduled medications so they can be taken together.
        </p>
      </div>
      {assignments.length < 2 ? (
        <p className="muted-text" style={{ fontSize: '0.88rem' }}>{emptyHint}</p>
      ) : (
        <>
          <fieldset className="plan-entity__choices">
            <legend className="plan-entity__label">Medications</legend>
            {assignments.map((assignment) => {
              const medication = medicationsById.get(assignment.medication_id);
              const medName = medication?.name ?? 'Medication';
              return (
                <label key={assignment.id} className="plan-entity__choice">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(assignment.id)}
                    onChange={() => toggle(assignment.id)}
                  />
                  <span className="plan-entity__choice-copy">
                    <strong>{medName}</strong>
                    <span>{assignment.dose_label}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div className="form-row">
            <label htmlFor="bundle-name" style={{ fontSize: '0.82rem' }}>Name (optional)</label>
            <input
              id="bundle-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={placeholder}
            />
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="button"
          disabled={assignments.length < 2 || selectedIds.length < 2 || saving}
          onClick={() => onCreate(selectedIds, name)}
        >
          {saving ? 'Saving…' : 'Create bundle'}
        </button>
        <button type="button" className="button button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && (
        <div className="error-state" role="alert">
          Bundle could not be saved. Choose two or more scheduled medications and try again.
        </div>
      )}
    </article>
  );
}
