import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  medicationsApi,
  type CreateMedAssignment,
  type EditMedAssignment,
  type MedAssignment,
  type MedFrequency,
  type ReviseMedAssignment,
  type UpdateMedication,
} from '../api/medications';
import { NoPetSelected } from '../components/NoPetSelected';
import { AssignmentCreateCard } from '../components/health/AssignmentCreateCard';
import { AssignmentGroupCard } from '../components/health/AssignmentGroupCard';
import { BundleCard } from '../components/health/BundleCard';
import { BundleCreateCard } from '../components/health/BundleCreateCard';
import { KnownMedicationCard } from '../components/health/KnownMedicationCard';
import { MedColorSwatch } from '../components/health/MedColorSwatch';
import { type FormulationPickerValue } from '../components/health/FormulationPicker';
import { useSelectedPet } from '../context/SelectedPetContext';
import { usePermissions } from '../context/usePermissions';
import { localToday, shiftDate } from '../lib/dates';
import {
  assignmentDeleteErrorMessage,
  assignmentStatus,
  bundleableAssignments,
  groupAssignmentsByMedication,
  randomMedColor,
  unbundledAssignments,
} from '../lib/medications';
import { parseDecimal } from '../lib/numbers';
import {
  defaultFormulationPickerValue,
  defaultMedFrequency,
} from '../lib/medicationDefaults';

export default function HealthTreatmentPlanPage() {
  const queryClient = useQueryClient();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const { canWrite } = usePermissions();
  const today = localToday();

  const [showCreateMed, setShowCreateMed] = useState(false);
  const [medName, setMedName] = useState('');
  const [medType, setMedType] = useState<'pill' | 'liquid'>('pill');
  const [medColor, setMedColor] = useState(() => randomMedColor());
  const [medEmoji, setMedEmoji] = useState('');
  const [medDescription, setMedDescription] = useState('');

  const [planMedId, setPlanMedId] = useState<string | null>(null);
  const [planMealWait, setPlanMealWait] = useState('');
  const [formulation, setFormulation] = useState<FormulationPickerValue>(defaultFormulationPickerValue);
  const [reuseFormulationId, setReuseFormulationId] = useState<string | null>(null);
  const [liquidDoseMl, setLiquidDoseMl] = useState('2.5');
  const [liquidConcentration, setLiquidConcentration] = useState('');
  const [planFrequency, setPlanFrequency] = useState<MedFrequency>(defaultMedFrequency);
  const [planFrom, setPlanFrom] = useState(today);
  const [planTo, setPlanTo] = useState('');
  const [planOptional, setPlanOptional] = useState(false);

  const [reviseId, setReviseId] = useState<string | null>(null);
  const [editAssignmentId, setEditAssignmentId] = useState<string | null>(null);
  const [reviseFrom, setReviseFrom] = useState(today);
  const [formulationLocked, setFormulationLocked] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [showCreateBundle, setShowCreateBundle] = useState(false);

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

  const bundlesQuery = useQuery({
    queryKey: ['med-bundles', selectedPetId],
    queryFn: () => medicationsApi.listBundles(selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['medications'] });
    queryClient.invalidateQueries({ queryKey: ['med-assignments'] });
    queryClient.invalidateQueries({ queryKey: ['med-bundles'] });
    queryClient.invalidateQueries({ queryKey: ['med-daily'] });
  };

  const createMedMutation = useMutation({
    mutationFn: () =>
      medicationsApi.create({
        pet_id: selectedPetId!,
        name: medName.trim(),
        med_type: medType,
        color: medColor,
        emoji: medEmoji.trim() || undefined,
        description: medDescription.trim() || undefined,
      }),
    onSuccess: () => {
      setMedName('');
      setMedType('pill');
      setMedColor(randomMedColor());
      setMedEmoji('');
      setMedDescription('');
      setShowCreateMed(false);
      invalidate();
    },
  });

  const updateMedMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMedication }) =>
      medicationsApi.update(id, patch),
    onSuccess: () => {
      setEditingMedId(null);
      invalidate();
    },
  });

  function parsedMealWait(): number | null {
    if (planMealWait === '') return null;
    const n = parseInt(planMealWait, 10);
    return n > 0 ? n : null;
  }

  function buildPlanBase() {
    return {
      ...(planOptional ? {} : { frequency: planFrequency }),
      date_to: planTo.trim() || null,
      optional: planOptional,
      meal_wait_minutes: parsedMealWait(),
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
        liquid_dose_ml: planOptional ? undefined : parseDecimal(liquidDoseMl),
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
        dose_fraction: planOptional ? undefined : formulation.doseFraction,
      };
    }
    return {
      ...base,
      tablet_strength_mg: strength,
      pill_shape: formulation.pillShape,
      dose_fraction: planOptional ? undefined : formulation.doseFraction,
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
        liquid_dose_ml: planOptional ? undefined : parseDecimal(liquidDoseMl),
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
        dose_fraction: planOptional ? undefined : formulation.doseFraction,
      };
    }
    return {
      ...base,
      tablet_strength_mg: strength,
      pill_shape: formulation.pillShape,
      dose_fraction: planOptional ? undefined : formulation.doseFraction,
    };
  }

  function buildEditPayload(): EditMedAssignment {
    const selectedMed = (medsQuery.data ?? []).find((m) => m.id === planMedId);
    const base = {
      ...buildPlanBase(),
      date_from: planFrom,
    };

    if (selectedMed?.med_type === 'liquid') {
      return {
        ...base,
        liquid_dose_ml: planOptional ? undefined : parseDecimal(liquidDoseMl),
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
        dose_fraction: planOptional ? undefined : formulation.doseFraction,
      };
    }
    return {
      ...base,
      tablet_strength_mg: strength,
      pill_shape: formulation.pillShape,
      dose_fraction: planOptional ? undefined : formulation.doseFraction,
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
    mutationFn: (assignmentId: string) =>
      medicationsApi.reviseAssignment(assignmentId, buildRevisePayload()),
    onSuccess: () => {
      resetPlanForm();
      invalidate();
    },
  });

  const endMutation = useMutation({
    mutationFn: ({ id, ended_on }: { id: string; ended_on: string }) =>
      medicationsApi.endAssignment(id, { ended_on }),
    onSuccess: invalidate,
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.deleteAssignment(id),
    onSuccess: invalidate,
  });

  const editAssignmentMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      medicationsApi.editAssignment(assignmentId, buildEditPayload()),
    onSuccess: () => {
      setEditAssignmentId(null);
      resetPlanForm();
      invalidate();
    },
  });

  const deleteMedMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.delete(id),
    onSuccess: invalidate,
  });

  const createBundleMutation = useMutation({
    mutationFn: ({ assignmentIds, name }: { assignmentIds: string[]; name: string }) =>
      medicationsApi.createBundle({
        pet_id: selectedPetId!,
        name: name.trim() || undefined,
        assignment_ids: assignmentIds,
      }),
    onSuccess: () => {
      resetBundleForm();
      invalidate();
    },
  });

  const deleteBundleMutation = useMutation({
    mutationFn: (id: string) => medicationsApi.deleteBundle(id),
    onSuccess: invalidate,
  });

  function resetBundleForm() {
    createBundleMutation.reset();
    setShowCreateBundle(false);
  }

  function resetPlanForm() {
    createPlanMutation.reset();
    reviseMutation.reset();
    editAssignmentMutation.reset();
    setPlanMedId(null);
    setReviseId(null);
    setEditAssignmentId(null);
    setReuseFormulationId(null);
    setFormulationLocked(true);
    setFormulation(defaultFormulationPickerValue);
    setLiquidDoseMl('2.5');
    setLiquidConcentration('');
    setPlanFrequency(defaultMedFrequency);
    setPlanFrom(today);
    setPlanTo('');
    setPlanOptional(false);
    setPlanMealWait('');
    setPlanOpen(false);
    setShowCreateBundle(false);
  }

  const medications = useMemo(() => medsQuery.data ?? [], [medsQuery.data]);
  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const bundles = useMemo(() => bundlesQuery.data ?? [], [bundlesQuery.data]);
  const assignmentGroups = useMemo(
    () => groupAssignmentsByMedication(assignments, today),
    [assignments, today],
  );
  const bundleChoices = useMemo(
    () => unbundledAssignments(assignments, bundles, today),
    [assignments, bundles, today],
  );
  const medById = useMemo(
    () => new Map(medications.map((medication) => [medication.id, medication])),
    [medications],
  );
  const activeMedicationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const assignment of assignments) {
      if (assignmentStatus(assignment, today) === 'active') {
        ids.add(assignment.medication_id);
      }
    }
    return ids;
  }, [assignments, today]);

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  function startNewAssignment(medicationId?: string) {
    resetBundleForm();
    resetPlanForm();
    setPlanMedId(medicationId ?? null);
    setPlanOpen(true);
  }

  function startNewBundle() {
    resetPlanForm();
    createBundleMutation.reset();
    setShowCreateBundle(true);
  }

  function startRevise(assignment: MedAssignment) {
    const medication = medById.get(assignment.medication_id);
    if (!medication) return;
    resetPlanForm();
    setReviseId(assignment.id);
    setPlanMedId(medication.id);
    setPlanOpen(true);
    setReuseFormulationId(assignment.formulation_id);
    setFormulationLocked(true);
    setFormulation({
      tabletStrengthMg: String(assignment.formulation.tablet_strength_mg ?? '5'),
      pillShape: assignment.formulation.pill_shape ?? 'round',
      doseFraction: assignment.dose_fraction ?? 'half',
    });
    setLiquidDoseMl(String(assignment.liquid_dose_ml ?? '2.5'));
    setLiquidConcentration(
      assignment.formulation.liquid_concentration_mg_per_ml != null
        ? String(assignment.formulation.liquid_concentration_mg_per_ml)
        : '',
    );
    setPlanFrequency(assignment.frequency);
    setPlanOptional(assignment.optional);
    setPlanTo(assignment.date_to ?? '');
    setPlanMealWait(assignment.meal_wait_minutes != null ? String(assignment.meal_wait_minutes) : '');
    setReviseFrom(today);
  }

  function startEdit(assignment: MedAssignment) {
    const medication = medById.get(assignment.medication_id);
    if (!medication) return;
    resetPlanForm();
    setEditAssignmentId(assignment.id);
    setPlanMedId(medication.id);
    setPlanFrom(assignment.date_from);
    setReuseFormulationId(assignment.formulation_id);
    setFormulationLocked(true);
    setFormulation({
      tabletStrengthMg: String(assignment.formulation.tablet_strength_mg ?? '5'),
      pillShape: assignment.formulation.pill_shape ?? 'round',
      doseFraction: assignment.dose_fraction ?? 'half',
    });
    setLiquidDoseMl(String(assignment.liquid_dose_ml ?? '2.5'));
    setLiquidConcentration(
      assignment.formulation.liquid_concentration_mg_per_ml != null
        ? String(assignment.formulation.liquid_concentration_mg_per_ml)
        : '',
    );
    setPlanFrequency(assignment.frequency);
    setPlanOptional(assignment.optional);
    setPlanTo(assignment.date_to ?? '');
    setPlanMealWait(assignment.meal_wait_minutes != null ? String(assignment.meal_wait_minutes) : '');
  }

  function handlePause(assignment: MedAssignment) {
    const endedOn = shiftDate(today, -1);
    if (assignment.date_from > endedOn) {
      window.alert(
        'This assignment starts today or later, so it cannot be paused. Delete it instead if it was created by mistake.',
      );
      return;
    }
    if (window.confirm('Pause this assignment so it is no longer due from today?')) {
      endMutation.mutate({ id: assignment.id, ended_on: endedOn });
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Health</p>
          <h2>Treatment plan · {selectedPet?.name ?? 'Pet'}</h2>
        </div>
        {canWrite && !showCreateMed && (
          <button
            type="button"
            className="button"
            onClick={() => {
              createMedMutation.reset();
              setMedColor(randomMedColor());
              setMedEmoji('');
              setMedDescription('');
              setShowCreateMed(true);
            }}
          >
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.82rem' }}>Color</span>
              <MedColorSwatch color={medColor} onChange={setMedColor} title="Choose medication color" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem' }}>
              Emoji
              <input
                aria-label="Telegram emoji"
                type="text"
                value={medEmoji}
                onChange={(e) => setMedEmoji(e.target.value)}
                placeholder="💊"
                style={{ width: '4rem', textAlign: 'center' }}
              />
            </label>
          </div>
          <div className="form-row" style={{ marginBottom: '0.75rem' }}>
            <label style={{ fontSize: '0.82rem' }}>Description (optional)</label>
            <textarea
              value={medDescription}
              rows={2}
              placeholder="e.g. purpose, storage, side effects"
              style={{ resize: 'vertical' }}
              onChange={(e) => setMedDescription(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" className="button" disabled={!medName.trim() || createMedMutation.isPending} onClick={() => createMedMutation.mutate()}>
              {createMedMutation.isPending ? 'Saving…' : 'Save medication'}
            </button>
            <button type="button" className="button button-secondary" onClick={() => { createMedMutation.reset(); setMedDescription(''); setShowCreateMed(false); }}>Cancel</button>
          </div>
          {createMedMutation.isError && (
            <div className="error-state" role="alert" style={{ marginTop: '0.75rem' }}>
              Medication could not be saved. Check the details and try again.
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h3>Known medications</h3>
          </div>
        </div>

        {medsQuery.isPending ? (
          <div className="loading-state">Loading…</div>
        ) : medications.length === 0 ? (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>No medications registered yet.</p>
        ) : (
          <div className="plan-entity-list">
            {medications.map((medication) => (
              <KnownMedicationCard
                key={medication.id}
                medication={medication}
                canWrite={canWrite}
                canAssign={!activeMedicationIds.has(medication.id)}
                editing={editingMedId === medication.id}
                saving={updateMedMutation.isPending && editingMedId === medication.id}
                deleting={deleteMedMutation.isPending}
                onEdit={() => {
                  updateMedMutation.reset();
                  setEditingMedId(medication.id);
                }}
                onCancelEdit={() => {
                  updateMedMutation.reset();
                  setEditingMedId(null);
                }}
                onSave={(patch) => updateMedMutation.mutate({ id: medication.id, patch })}
                onAssign={() => startNewAssignment(medication.id)}
                onDelete={() => {
                  if (window.confirm(`Delete ${medication.name}?`)) {
                    deleteMedMutation.mutate(medication.id);
                  }
                }}
              />
            ))}
          </div>
        )}
        {updateMedMutation.isError && (
          <div className="error-state" role="alert">
            Medication could not be saved. Check the details and try again.
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Assignments</h3>
          </div>
          {canWrite && medications.length > 0 && !planOpen && !reviseId && !editAssignmentId && (
            <button type="button" className="button" onClick={() => startNewAssignment()}>
              + New assignment
            </button>
          )}
        </div>

        {assignmentsQuery.isPending ? (
          <div className="loading-state">Loading…</div>
        ) : (
          <div className="plan-entity-list">
            {(planOpen || reviseId || editAssignmentId) && canWrite && (
              <AssignmentCreateCard
                revising={Boolean(reviseId)}
                editing={Boolean(editAssignmentId)}
                medications={medications}
                planMedId={planMedId}
                onPlanMedIdChange={setPlanMedId}
                formulation={formulation}
                onFormulationChange={setFormulation}
                formulationLocked={formulationLocked}
                onFormulationLockedChange={setFormulationLocked}
                planOptional={planOptional}
                onPlanOptionalChange={setPlanOptional}
                liquidDoseMl={liquidDoseMl}
                onLiquidDoseMlChange={setLiquidDoseMl}
                liquidConcentration={liquidConcentration}
                onLiquidConcentrationChange={setLiquidConcentration}
                planFrequency={planFrequency}
                onPlanFrequencyChange={setPlanFrequency}
                planFrom={planFrom}
                onPlanFromChange={setPlanFrom}
                reviseFrom={reviseFrom}
                onReviseFromChange={setReviseFrom}
                planTo={planTo}
                onPlanToChange={setPlanTo}
                mealWaitMinutes={planMealWait}
                onMealWaitMinutesChange={setPlanMealWait}
                saving={createPlanMutation.isPending || reviseMutation.isPending || editAssignmentMutation.isPending}
                error={createPlanMutation.isError || reviseMutation.isError || editAssignmentMutation.isError}
                onSave={() => {
                  if (editAssignmentId) editAssignmentMutation.mutate(editAssignmentId);
                  else if (reviseId) reviseMutation.mutate(reviseId);
                  else createPlanMutation.mutate();
                }}
                onCancel={resetPlanForm}
              />
            )}
            {assignmentGroups.length === 0 && !planOpen && !reviseId && !editAssignmentId ? (
              <p className="muted-text" style={{ fontSize: '0.88rem' }}>
                No assignments yet.
              </p>
            ) : (
              assignmentGroups.map((group) => (
                <AssignmentGroupCard
                  key={group.medicationId}
                  medication={medById.get(group.medicationId)}
                  current={group.current}
                  past={group.past}
                  today={today}
                  canWrite={canWrite}
                  canAssign={!activeMedicationIds.has(group.medicationId)}
                  deleting={deleteAssignmentMutation.isPending}
                  pausing={endMutation.isPending}
                  onRevise={startRevise}
                  onPause={handlePause}
                  onEdit={startEdit}
                  onAssign={() => startNewAssignment(group.medicationId)}
                  onDelete={(assignment) => {
                    const medication = medById.get(assignment.medication_id);
                    if (window.confirm(`Delete this ${medication?.name ?? 'medication'} assignment?`)) {
                      deleteAssignmentMutation.mutate(assignment.id);
                    }
                  }}
                />
              ))
            )}
          </div>
        )}
        {endMutation.isError && (
          <div className="error-state" role="alert" style={{ marginTop: '0.75rem' }}>
            Assignment could not be paused. Check the dates and try again.
          </div>
        )}
        {deleteAssignmentMutation.isError && (
          <div className="error-state" role="alert" style={{ marginTop: '0.75rem' }}>
            {assignmentDeleteErrorMessage(deleteAssignmentMutation.error)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Together</p>
            <h3>Bundles</h3>
          </div>
          {canWrite && !showCreateBundle && (
            <button type="button" className="button" onClick={startNewBundle}>
              + New bundle
            </button>
          )}
        </div>

        {bundlesQuery.isPending ? (
          <div className="loading-state">Loading…</div>
        ) : (
          <div className="plan-entity-list">
            {showCreateBundle && canWrite && (
              <BundleCreateCard
                assignments={bundleChoices}
                medicationsById={medById}
                saving={createBundleMutation.isPending}
                error={createBundleMutation.isError}
                emptyHint={
                  bundleableAssignments(assignments, today).length >= 2
                    ? 'Every scheduled medication is already in a bundle.'
                    : 'You need two current scheduled assignments (not as-needed) to create a bundle.'
                }
                onCreate={(assignmentIds, name) => {
                  createBundleMutation.reset();
                  createBundleMutation.mutate({ assignmentIds, name });
                }}
                onCancel={resetBundleForm}
              />
            )}
            {bundles.length === 0 && !showCreateBundle ? (
              <p className="muted-text" style={{ fontSize: '0.88rem' }}>
                No bundles yet.
              </p>
            ) : (
              bundles.map((bundle) => (
                <BundleCard
                  key={bundle.id}
                  bundle={bundle}
                  canWrite={canWrite}
                  deleting={deleteBundleMutation.isPending}
                  onDelete={() => {
                    if (window.confirm(`Delete bundle ${bundle.name}?`)) {
                      deleteBundleMutation.mutate(bundle.id);
                    }
                  }}
                />
              ))
            )}
          </div>
        )}
        {deleteBundleMutation.isError && (
          <div className="error-state" role="alert" style={{ marginTop: '0.75rem' }}>
            Bundle could not be deleted. Try again.
          </div>
        )}
      </section>
    </div>
  );
}
