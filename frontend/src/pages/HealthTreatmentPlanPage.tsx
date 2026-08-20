import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  medicationsApi,
  type CreateMedAssignment,
  type CreateMedication,
  type MedAssignment,
  type Medication,
  type ReviseMedAssignment,
} from '../api/medications';
import { NoPetSelected } from '../components/NoPetSelected';
import { MedIcon } from '../components/health/MedIcon';
import { MedIconPicker, defaultMedIconPickerValue, type MedIconPickerValue } from '../components/health/MedIconPicker';
import { useSelectedPet } from '../context/SelectedPetContext';
import { usePermissions } from '../context/usePermissions';
import { localToday } from '../lib/dates';
import { formatFrequency } from '../lib/medications';

interface MedPlanRow {
  medication: Medication;
  currentAssignment: MedAssignment | null;
  history: MedAssignment[];
}

function buildPlanRows(meds: Medication[], assignments: MedAssignment[], today: string): MedPlanRow[] {
  return meds.map((medication) => {
    const history = assignments
      .filter((a) => a.medication_id === medication.id)
      .sort((a, b) => b.date_from.localeCompare(a.date_from));
    const currentAssignment =
      history.find(
        (a) =>
          a.date_from <= today &&
          (a.date_to == null || a.date_to >= today),
      ) ?? null;
    return { medication, currentAssignment, history };
  });
}

export default function HealthTreatmentPlanPage() {
  const queryClient = useQueryClient();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const { canWrite } = usePermissions();
  const today = localToday();

  const [showCreateMed, setShowCreateMed] = useState(false);
  const [medName, setMedName] = useState('');
  const [iconValue, setIconValue] = useState<MedIconPickerValue>(defaultMedIconPickerValue);

  const [planMedId, setPlanMedId] = useState<string | null>(null);
  const [planDosage, setPlanDosage] = useState('');
  const [planTimes, setPlanTimes] = useState('08:00, 20:00');
  const [planFrom, setPlanFrom] = useState(today);
  const [planTo, setPlanTo] = useState('');
  const [planOptional, setPlanOptional] = useState(false);

  const [reviseId, setReviseId] = useState<string | null>(null);
  const [reviseFrom, setReviseFrom] = useState(today);

  const medsQuery = useQuery({
    queryKey: ['medications', selectedPetId],
    queryFn: () => medicationsApi.list(selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['med-assignments', selectedPetId],
    queryFn: () => medicationsApi.listAssignments({ pet_id: selectedPetId! }),
    enabled: Boolean(selectedPetId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['medications'] });
    queryClient.invalidateQueries({ queryKey: ['med-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['med-daily'] });
  };

  const createMedMutation = useMutation({
    mutationFn: () => {
      const payload: CreateMedication = {
        pet_id: selectedPetId!,
        name: medName.trim(),
        med_type: iconValue.medType,
        color: iconValue.color,
      };
      if (iconValue.medType === 'pill') {
        payload.pill_shape = iconValue.pillShape;
        payload.pill_fraction = iconValue.pillFraction;
      }
      return medicationsApi.create(payload);
    },
    onSuccess: () => {
      setMedName('');
      setIconValue(defaultMedIconPickerValue);
      setShowCreateMed(false);
      invalidate();
    },
  });

  const createPlanMutation = useMutation({
    mutationFn: () => {
      const times = planTimes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: CreateMedAssignment = {
        medication_id: planMedId!,
        dosage: planDosage.trim(),
        frequency: { times },
        date_from: planFrom,
        date_to: planTo.trim() || null,
        optional: planOptional,
      };
      return medicationsApi.createAssignment(payload);
    },
    onSuccess: () => {
      setPlanMedId(null);
      setPlanDosage('');
      setPlanTimes('08:00, 20:00');
      setPlanFrom(today);
      setPlanTo('');
      setPlanOptional(false);
      invalidate();
    },
  });

  const reviseMutation = useMutation({
    mutationFn: (assignmentId: string) => {
      const times = planTimes
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const payload: ReviseMedAssignment = {
        dosage: planDosage.trim(),
        frequency: { times },
        effective_from: reviseFrom,
        date_to: planTo.trim() || null,
        optional: planOptional,
      };
      return medicationsApi.reviseAssignment(assignmentId, payload);
    },
    onSuccess: () => {
      setReviseId(null);
      invalidate();
    },
  });

  const deleteMedMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.delete(id),
    onSuccess: invalidate,
  });

  const planRows = useMemo(
    () => buildPlanRows(medsQuery.data ?? [], assignmentsQuery.data ?? [], today),
    [medsQuery.data, assignmentsQuery.data, today],
  );

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  function startRevise(row: MedPlanRow) {
    if (!row.currentAssignment) return;
    setReviseId(row.currentAssignment.id);
    setPlanMedId(row.medication.id);
    setPlanDosage(row.currentAssignment.dosage);
    setPlanTimes(row.currentAssignment.frequency.times.join(', '));
    setPlanOptional(row.currentAssignment.optional);
    setPlanTo(row.currentAssignment.date_to ?? '');
    setReviseFrom(today);
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Health</p>
          <h2>Treatment plan · {selectedPet?.name ?? 'Pet'}</h2>
        </div>
        {canWrite && !showCreateMed && (
          <button type="button" className="button" onClick={() => setShowCreateMed(true)}>
            + Register med
          </button>
        )}
      </section>

      {showCreateMed && canWrite && (
        <section className="panel">
          <h3 style={{ marginBottom: '0.75rem' }}>Register medication</h3>
          <div className="form-row" style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.82rem' }}>Name</label>
            <input
              type="text"
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              placeholder="e.g. Metronidazole"
            />
          </div>
          <MedIconPicker value={iconValue} onChange={setIconValue} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              type="button"
              className="button"
              disabled={!medName.trim() || createMedMutation.isPending}
              onClick={() => createMedMutation.mutate()}
            >
              {createMedMutation.isPending ? 'Saving…' : 'Save medication'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setShowCreateMed(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}

      {(planMedId || reviseId) && canWrite && (
        <section className="panel">
          <h3 style={{ marginBottom: '0.75rem' }}>
            {reviseId ? 'Revise assignment' : 'New treatment plan'}
          </h3>
          {!reviseId && (
            <div className="form-row" style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.82rem' }}>Medication</label>
              <select value={planMedId ?? ''} onChange={(e) => setPlanMedId(e.target.value || null)}>
                <option value="">Select…</option>
                {(medsQuery.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))' }}>
            <div className="form-row">
              <label style={{ fontSize: '0.82rem' }}>Dosage</label>
              <input type="text" value={planDosage} onChange={(e) => setPlanDosage(e.target.value)} placeholder="e.g. 1 pill, 5ml" />
            </div>
            <div className="form-row">
              <label style={{ fontSize: '0.82rem' }}>Times (comma-separated)</label>
              <input type="text" value={planTimes} onChange={(e) => setPlanTimes(e.target.value)} />
            </div>
            {!reviseId && (
              <div className="form-row">
                <label style={{ fontSize: '0.82rem' }}>From</label>
                <input type="date" value={planFrom} onChange={(e) => setPlanFrom(e.target.value)} />
              </div>
            )}
            {reviseId && (
              <div className="form-row">
                <label style={{ fontSize: '0.82rem' }}>Effective from</label>
                <input type="date" value={reviseFrom} onChange={(e) => setReviseFrom(e.target.value)} />
              </div>
            )}
            <div className="form-row">
              <label style={{ fontSize: '0.82rem' }}>Until (optional)</label>
              <input type="date" value={planTo} onChange={(e) => setPlanTo(e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.65rem', fontSize: '0.82rem' }}>
            <input type="checkbox" checked={planOptional} onChange={(e) => setPlanOptional(e.target.checked)} />
            Optional medication
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="button"
              disabled={
                !planMedId ||
                !planDosage.trim() ||
                createPlanMutation.isPending ||
                reviseMutation.isPending
              }
              onClick={() => {
                if (reviseId) reviseMutation.mutate(reviseId);
                else createPlanMutation.mutate();
              }}
            >
              {reviseId ? 'Save revision' : 'Create plan'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setPlanMedId(null);
                setReviseId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Active plans</p>
            <h3>Medications</h3>
          </div>
        </div>

        {medsQuery.isPending ? (
          <div className="loading-state">Loading…</div>
        ) : planRows.length === 0 ? (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>No medications registered yet.</p>
        ) : (
          planRows.map((row) => (
            <div key={row.medication.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <MedIcon
                  medType={row.medication.med_type}
                  color={row.medication.color}
                  pillShape={row.medication.pill_shape}
                  pillFraction={row.medication.pill_fraction}
                  size={44}
                />
                <div style={{ flex: 1 }}>
                  <strong>{row.medication.name}</strong>
                  {row.currentAssignment ? (
                    <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                      {row.currentAssignment.dosage} · {formatFrequency(row.currentAssignment.frequency.times)}
                      {' · '}
                      {row.currentAssignment.date_from}
                      {row.currentAssignment.date_to ? ` → ${row.currentAssignment.date_to}` : ' → ongoing'}
                      {row.currentAssignment.optional ? ' · Optional' : ''}
                    </p>
                  ) : (
                    <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                      No active assignment
                    </p>
                  )}
                  {row.history.length > 1 && (
                    <details style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
                      <summary className="muted-text" style={{ cursor: 'pointer' }}>
                        {row.history.length} assignment records
                      </summary>
                      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                        {row.history.map((a) => (
                          <li key={a.id} className="muted-text">
                            {a.dosage} · {a.date_from}{a.date_to ? ` → ${a.date_to}` : ' → ongoing'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {!row.currentAssignment && (
                      <button
                        type="button"
                        className="button"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => {
                          setReviseId(null);
                          setPlanMedId(row.medication.id);
                          setPlanDosage('');
                          setPlanTimes('08:00');
                          setPlanFrom(today);
                          setPlanTo('');
                          setPlanOptional(false);
                        }}
                      >
                        Add plan
                      </button>
                    )}
                    {row.currentAssignment && (
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                        onClick={() => startRevise(row)}
                      >
                        Revise
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      disabled={deleteMedMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete ${row.medication.name} and all related records?`)) {
                          deleteMedMutation.mutate(row.medication.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
