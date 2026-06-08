import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { petsApi } from '../api/pets';
import { nutritionSchedulesApi } from '../api/nutritionSchedules';
import type { NutritionSchedule } from '../types';

interface NutritionScheduleFormState {
  pet_id: string;
  name: string;
  active: boolean;
  rules: string;
}

function createDefaultRules() {
  return JSON.stringify({ reminder_times: ['08:00', '18:00'] }, null, 2);
}

function parseRules(text: string) {
  return text.trim() ? JSON.parse(text) : {};
}

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [filterPetId, setFilterPetId] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<NutritionScheduleFormState>({ pet_id: '', name: '', active: true, rules: createDefaultRules() });
  const [editingForm, setEditingForm] = useState<NutritionScheduleFormState>({ pet_id: '', name: '', active: true, rules: createDefaultRules() });

  const petsQuery = useQuery({ queryKey: ['pets'], queryFn: petsApi.list });
  const schedulesQuery = useQuery({
    queryKey: ['nutrition-schedules', filterPetId],
    queryFn: () => nutritionSchedulesApi.list(filterPetId || undefined),
  });
  const petNames = useMemo(() => new Map((petsQuery.data ?? []).map((pet) => [pet.id, pet.name])), [petsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setFormError('');
      return nutritionSchedulesApi.create({
        pet_id: createForm.pet_id,
        name: createForm.name,
        active: createForm.active,
        rules: parseRules(createForm.rules),
      });
    },
    onSuccess: async () => {
      setCreateForm({ pet_id: createForm.pet_id, name: '', active: true, rules: createDefaultRules() });
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to create nutrition schedule.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: NutritionScheduleFormState }) => {
      setFormError('');
      return nutritionSchedulesApi.update(id, {
        name: form.name,
        active: form.active,
        rules: parseRules(form.rules),
      });
    },
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to update nutrition schedule.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => nutritionSchedulesApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h2>Feeding schedules</h2>
          <p className="muted-text">Store recurring feeding reminders and rules per pet.</p>
        </div>
        <div className="filter-row">
          <label htmlFor="schedule-filter">Filter</label>
          <select id="schedule-filter" value={filterPetId} onChange={(event) => setFilterPetId(event.target.value)}>
            <option value="">All pets</option>
            {(petsQuery.data ?? []).map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Add schedule</p>
            <h3>Create a recurring plan</h3>
          </div>
        </div>
        <NutritionScheduleForm
          pets={petsQuery.data ?? []}
          form={createForm}
          setForm={setCreateForm}
          submitLabel={createMutation.isPending ? 'Saving…' : 'Create schedule'}
          onSubmit={() => createMutation.mutate()}
        />
        {formError && <div className="error-state">{formError}</div>}
      </section>

      {schedulesQuery.isLoading ? (
        <div className="loading-state">Loading nutrition schedules…</div>
      ) : schedulesQuery.isError ? (
        <div className="error-state">{schedulesQuery.error instanceof Error ? schedulesQuery.error.message : 'Unable to load nutrition schedules.'}</div>
      ) : (schedulesQuery.data ?? []).length === 0 ? (
        <div className="empty-state">No nutrition schedules found for the current filter.</div>
      ) : (
        <div className="card-grid">
          {(schedulesQuery.data ?? []).map((schedule) => (
            <article key={schedule.id} className="panel">
              {editingId === schedule.id ? (
                <NutritionScheduleForm
                  pets={petsQuery.data ?? []}
                  form={editingForm}
                  setForm={setEditingForm}
                  submitLabel={updateMutation.isPending ? 'Saving…' : 'Update schedule'}
                  onSubmit={() => updateMutation.mutate({ id: schedule.id, form: editingForm })}
                  onCancel={() => setEditingId(null)}
                  disablePetSelection
                />
              ) : (
                <>
                  <div className="entry-card-header">
                    <div>
                      <h3>{schedule.name}</h3>
                      <p className="muted-text">{petNames.get(schedule.pet_id) ?? 'Unknown pet'}</p>
                    </div>
                    <span className={`status-pill${schedule.active ? ' active' : ''}`}>{schedule.active ? 'Active' : 'Paused'}</span>
                  </div>
                  <pre className="code-block">{schedule.rules_json}</pre>
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setEditingId(schedule.id);
                        setEditingForm({
                          pet_id: schedule.pet_id,
                          name: schedule.name,
                          active: schedule.active,
                          rules: formatRules(schedule),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete schedule ${schedule.name}?`)) {
                          deleteMutation.mutate(schedule.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRules(schedule: NutritionSchedule) {
  try {
    return JSON.stringify(JSON.parse(schedule.rules_json), null, 2);
  } catch {
    return schedule.rules_json;
  }
}

function NutritionScheduleForm({
  pets,
  form,
  setForm,
  onSubmit,
  submitLabel,
  onCancel,
  disablePetSelection = false,
}: {
  pets: { id: string; name: string }[];
  form: NutritionScheduleFormState;
  setForm: React.Dispatch<React.SetStateAction<NutritionScheduleFormState>>;
  onSubmit: () => void;
  submitLabel: string;
  onCancel?: () => void;
  disablePetSelection?: boolean;
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-row">
        <label htmlFor="schedule-pet">Pet</label>
        <select
          id="schedule-pet"
          value={form.pet_id}
          onChange={(event) => setForm((current) => ({ ...current, pet_id: event.target.value }))}
          disabled={disablePetSelection}
          required
        >
          <option value="">Select a pet</option>
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="schedule-name">Name</label>
        <input id="schedule-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
      </div>
      <label className="checkbox-row">
        <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />
        Active
      </label>
      <div className="form-row form-row-full">
        <label htmlFor="schedule-rules">Rules JSON</label>
        <textarea id="schedule-rules" rows={8} value={form.rules} onChange={(event) => setForm((current) => ({ ...current, rules: event.target.value }))} />
      </div>
      <div className="button-row form-row-full">
        <button className="button" type="submit">
          {submitLabel}
        </button>
        {onCancel && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
