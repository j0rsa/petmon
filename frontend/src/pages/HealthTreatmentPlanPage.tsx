import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  medicationsApi,
  type CreateMedAssignment,
  type MedAssignment,
  type MedFrequency,
  type Medication,
  type ReviseMedAssignment,
} from '../api/medications';
import { NoPetSelected } from '../components/NoPetSelected';
import { MedColorSwatch } from '../components/health/MedColorSwatch';
import { MedIcon } from '../components/health/MedIcon';
import {
  MedScheduleEditor,
  defaultMedFrequency,
} from '../components/health/MedScheduleEditor';
import {
  FormulationPicker,
  defaultFormulationPickerValue,
  type FormulationPickerValue,
} from '../components/health/FormulationPicker';
import { useSelectedPet } from '../context/SelectedPetContext';
import { usePermissions } from '../context/usePermissions';
import { localToday } from '../lib/dates';
import {
  expectedDoseCount,
  formatFrequency,
  formulationLabel,
  randomMedColor,
} from '../lib/medications';
import { parseDecimal } from '../lib/numbers';

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
        (a) => a.date_from <= today && (a.date_to == null || a.date_to >= today),
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
  const [medType, setMedType] = useState<'pill' | 'liquid'>('pill');
  const [medColor, setMedColor] = useState(() => randomMedColor());

  const [planMedId, setPlanMedId] = useState<string | null>(null);
  const [formulation, setFormulation] = useState<FormulationPickerValue>(defaultFormulationPickerValue);
  const [reuseFormulationId, setReuseFormulationId] = useState<string | null>(null);
  const [liquidDoseMl, setLiquidDoseMl] = useState('2.5');
  const [liquidConcentration, setLiquidConcentration] = useState('');
  const [planFrequency, setPlanFrequency] = useState<MedFrequency>(defaultMedFrequency);
  const [planFrom, setPlanFrom] = useState(today);
  const [planTo, setPlanTo] = useState('');
  const [planOptional, setPlanOptional] = useState(false);

  const [reviseId, setReviseId] = useState<string | null>(null);
  const [reviseFrom, setReviseFrom] = useState(today);
  const [reviseMedColor, setReviseMedColor] = useState('#6366f1');
  const [formulationLocked, setFormulationLocked] = useState(true);

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
    mutationFn: () =>
      medicationsApi.create({
        pet_id: selectedPetId!,
        name: medName.trim(),
        med_type: medType,
        color: medColor,
      }),
    onSuccess: () => {
      setMedName('');
      setMedType('pill');
      setMedColor(randomMedColor());
      setShowCreateMed(false);
      invalidate();
    },
  });

  function buildPlanBase() {
    return {
      frequency: planFrequency,
      date_to: planTo.trim() || null,
      optional: planOptional,
    };
  }

  function buildCreatePayload(): CreateMedAssignment {
    const selectedMed = (medsQuery.data ?? []).find((m) => m.id === planMedId);
    const base = {
      medication_id: planMedId!,
      date_from: planFrom,
      ...buildPlanBase(),
    };
    if (selectedMed?.med_type === 'liquid') {
      return {
        ...base,
        liquid_dose_ml: parseDecimal(liquidDoseMl),
        liquid_concentration_mg_per_ml: liquidConcentration.trim()
          ? parseDecimal(liquidConcentration)
          : undefined,
        ...(reuseFormulationId ? { formulation_id: reuseFormulationId } : {}),
      };
    }

    const strength = parseDecimal(formulation.tabletStrengthMg);
    if (reuseFormulationId) {
      return {
        ...base,
        formulation_id: reuseFormulationId,
        dose_fraction: formulation.doseFraction,
      };
    }
    return {
      ...base,
      tablet_strength_mg: strength,
      pill_shape: formulation.pillShape,
      dose_fraction: formulation.doseFraction,
    };
  }

  function buildRevisePayload(): ReviseMedAssignment {
    const selectedMed = (medsQuery.data ?? []).find((m) => m.id === planMedId);
    const base = {
      ...buildPlanBase(),
      effective_from: reviseFrom,
    };

    if (selectedMed?.med_type === 'liquid') {
      return {
        ...base,
        liquid_dose_ml: parseDecimal(liquidDoseMl),
        liquid_concentration_mg_per_ml: liquidConcentration.trim()
          ? parseDecimal(liquidConcentration)
          : undefined,
        ...(reuseFormulationId && formulationLocked ? { formulation_id: reuseFormulationId } : {}),
      };
    }

    const strength = parseDecimal(formulation.tabletStrengthMg);
    if (reuseFormulationId && formulationLocked) {
      return {
        ...base,
        formulation_id: reuseFormulationId,
        dose_fraction: formulation.doseFraction,
      };
    }
    return {
      ...base,
      tablet_strength_mg: strength,
      pill_shape: formulation.pillShape,
      dose_fraction: formulation.doseFraction,
    };
  }

  const createPlanMutation = useMutation({
    mutationFn: () => medicationsApi.createAssignment(buildCreatePayload()),
    onSuccess: () => {
      resetPlanForm();
      invalidate();
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      const assignment = await medicationsApi.reviseAssignment(assignmentId, buildRevisePayload());
      if (planMedId) {
        const current = (medsQuery.data ?? []).find((m) => m.id === planMedId);
        if (current && current.color !== reviseMedColor) {
          await medicationsApi.update(planMedId, { color: reviseMedColor });
        }
      }
      return assignment;
    },
    onSuccess: () => {
      resetPlanForm();
      invalidate();
    },
  });

  const deleteMedMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.delete(id),
    onSuccess: invalidate,
  });

  function resetPlanForm() {
    setPlanMedId(null);
    setReviseId(null);
    setReuseFormulationId(null);
    setFormulationLocked(true);
    setFormulation(defaultFormulationPickerValue);
    setLiquidDoseMl('2.5');
    setLiquidConcentration('');
    setPlanFrequency(defaultMedFrequency);
    setPlanFrom(today);
    setPlanTo('');
    setPlanOptional(false);
  }

  const planRows = useMemo(
    () => buildPlanRows(medsQuery.data ?? [], assignmentsQuery.data ?? [], today),
    [medsQuery.data, assignmentsQuery.data, today],
  );

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  const planMed = (medsQuery.data ?? []).find((m) => m.id === planMedId);

  function startRevise(row: MedPlanRow) {
    const a = row.currentAssignment!;
    setReviseId(a.id);
    setPlanMedId(row.medication.id);
    setReviseMedColor(row.medication.color);
    setReuseFormulationId(a.formulation_id);
    setFormulationLocked(true);
    setFormulation({
      tabletStrengthMg: String(a.formulation.tablet_strength_mg ?? '5'),
      pillShape: a.formulation.pill_shape ?? 'round',
      doseFraction: a.dose_fraction ?? 'half',
    });
    setLiquidDoseMl(String(a.liquid_dose_ml ?? '2.5'));
    setLiquidConcentration(
      a.formulation.liquid_concentration_mg_per_ml != null
        ? String(a.formulation.liquid_concentration_mg_per_ml)
        : '',
    );
    setPlanFrequency(a.frequency);
    setPlanOptional(a.optional);
    setPlanTo(a.date_to ?? '');
    setReviseFrom(today);
  }

  useEffect(() => {
    if (showCreateMed) {
      setMedColor(randomMedColor());
    }
  }, [showCreateMed]);

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
              placeholder="e.g. Prednisolone"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(['pill', 'liquid'] as const).map((type) => (
              <button
                key={type}
                type="button"
                className={`button${medType === type ? '' : ' button-secondary'}`}
                onClick={() => setMedType(type)}
              >
                {type === 'pill' ? 'Pill' : 'Liquid'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="button" disabled={!medName.trim() || createMedMutation.isPending} onClick={() => createMedMutation.mutate()}>
              {createMedMutation.isPending ? 'Saving…' : 'Save medication'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => setShowCreateMed(false)}>Cancel</button>
          </div>
        </section>
      )}

      {(planMedId || reviseId) && canWrite && planMed && (
        <section className="panel">
          <h3 style={{ marginBottom: '0.75rem' }}>{reviseId ? 'Revise assignment' : 'New treatment plan'}</h3>
          {reviseId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.85rem' }}>
              <MedColorSwatch
                color={reviseMedColor}
                onChange={setReviseMedColor}
                title={`Change color for ${planMed.name}`}
              />
              <strong>{planMed.name}</strong>
            </div>
          )}
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

          {reviseId && planMed.med_type === 'liquid' && formulationLocked && (
            <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0 0 0.75rem' }}>
              Keeping the same bottle concentration.{' '}
              <button
                type="button"
                style={{ fontSize: 'inherit', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                onClick={() => setFormulationLocked(false)}
              >
                Change concentration
              </button>
            </p>
          )}

          {planMed.med_type === 'pill' ? (
            <FormulationPicker
              color={reviseId ? reviseMedColor : planMed.color}
              value={formulation}
              onChange={setFormulation}
              formulationLocked={reviseId ? formulationLocked : undefined}
              onFormulationLockedChange={reviseId ? setFormulationLocked : undefined}
            />
          ) : (
            <div style={{ display: 'grid', gap: '0.65rem', ...(reviseId && formulationLocked ? { opacity: 0.55, pointerEvents: 'none' } : {}) }}>
              <div className="form-row">
                <label style={{ fontSize: '0.82rem' }}>Dose (ml)</label>
                <input type="text" inputMode="decimal" value={liquidDoseMl} onChange={(e) => setLiquidDoseMl(e.target.value)} />
              </div>
              <div className="form-row">
                <label style={{ fontSize: '0.82rem' }}>Concentration (mg/ml, optional)</label>
                <input type="text" inputMode="decimal" value={liquidConcentration} onChange={(e) => setLiquidConcentration(e.target.value)} />
              </div>
            </div>
          )}

          <div style={{ marginTop: '0.9rem' }}>
            <MedScheduleEditor value={planFrequency} onChange={setPlanFrequency} />
          </div>

          <div style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', marginTop: '0.75rem' }}>
            {!reviseId ? (
              <div className="form-row">
                <label style={{ fontSize: '0.82rem' }}>From</label>
                <input type="date" value={planFrom} onChange={(e) => setPlanFrom(e.target.value)} />
              </div>
            ) : (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.65rem', width: 'fit-content' }}>
            <input
              id="plan-optional"
              type="checkbox"
              checked={planOptional}
              onChange={(e) => setPlanOptional(e.target.checked)}
            />
            <label htmlFor="plan-optional" style={{ fontSize: '0.82rem', cursor: 'pointer', userSelect: 'none' }}>
              Optional medication
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button
              type="button"
              className="button"
              disabled={
                !planMedId
                || expectedDoseCount(planFrequency) === 0
                || createPlanMutation.isPending
                || reviseMutation.isPending
              }
              onClick={() => {
                if (reviseId) reviseMutation.mutate(reviseId);
                else createPlanMutation.mutate();
              }}
            >
              {reviseId ? 'Save revision' : 'Create plan'}
            </button>
            <button type="button" className="button button-secondary" onClick={resetPlanForm}>Cancel</button>
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
                  pillShape={row.currentAssignment?.formulation.pill_shape}
                  doseFraction={row.currentAssignment?.dose_fraction}
                  size={44}
                />
                <div style={{ flex: 1 }}>
                  <strong>{row.medication.name}</strong>
                  {row.currentAssignment ? (
                    <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                      {row.currentAssignment.dose_label}
                      {' · '}
                      {formulationLabel(
                        row.currentAssignment.formulation.tablet_strength_mg,
                        row.currentAssignment.formulation.pill_shape,
                      )}
                      {' · '}
                      {formatFrequency(row.currentAssignment.frequency)}
                      {' · '}
                      {row.currentAssignment.date_from}
                      {row.currentAssignment.date_to ? ` → ${row.currentAssignment.date_to}` : ' → ongoing'}
                      {row.currentAssignment.optional ? ' · Optional' : ''}
                    </p>
                  ) : (
                    <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>No active assignment</p>
                  )}
                  {row.history.length > 1 && (
                    <details style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
                      <summary className="muted-text" style={{ cursor: 'pointer' }}>{row.history.length} assignment records</summary>
                      <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                        {row.history.map((a) => (
                          <li key={a.id} className="muted-text">
                            {a.dose_label} · {a.date_from}{a.date_to ? ` → ${a.date_to}` : ' → ongoing'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
                {canWrite && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {!row.currentAssignment && (
                      <button type="button" className="button" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => { resetPlanForm(); setPlanMedId(row.medication.id); }}>
                        Add plan
                      </button>
                    )}
                    {row.currentAssignment && (
                      <button type="button" className="button button-secondary" style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }} onClick={() => startRevise(row)}>
                        Revise
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem' }}
                      disabled={deleteMedMutation.isPending}
                      onClick={() => { if (window.confirm(`Delete ${row.medication.name}?`)) deleteMedMutation.mutate(row.medication.id); }}
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
