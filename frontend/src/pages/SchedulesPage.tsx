import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catsApi } from '../api/cats';
import { schedulesApi } from '../api/schedules';
import type { Schedule } from '../types';

interface ScheduleFormState {
  cat_id: string;
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
  const [filterCatId, setFilterCatId] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<ScheduleFormState>({ cat_id: '', name: '', active: true, rules: createDefaultRules() });
  const [editingForm, setEditingForm] = useState<ScheduleFormState>({ cat_id: '', name: '', active: true, rules: createDefaultRules() });

  const catsQuery = useQuery({ queryKey: ['cats'], queryFn: catsApi.list });
  const schedulesQuery = useQuery({ queryKey: ['schedules', filterCatId], queryFn: () => schedulesApi.list(filterCatId || undefined) });
  const catNames = useMemo(() => new Map((catsQuery.data ?? []).map((cat) => [cat.id, cat.name])), [catsQuery.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      setFormError('');
      return schedulesApi.create({
        cat_id: createForm.cat_id,
        name: createForm.name,
        active: createForm.active,
        rules: parseRules(createForm.rules),
      });
    },
    onSuccess: async () => {
      setCreateForm({ cat_id: createForm.cat_id, name: '', active: true, rules: createDefaultRules() });
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to create schedule.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: string; form: ScheduleFormState }) => {
      setFormError('');
      return schedulesApi.update(id, {
        name: form.name,
        active: form.active,
        rules: parseRules(form.rules),
      });
    },
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to update schedule.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => schedulesApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Schedules</p>
          <h2>Manage intake routines</h2>
          <p className="muted-text">Store recurring reminders and automation rules per cat.</p>
        </div>
        <div className="filter-row">
          <label htmlFor="schedule-filter">Filter</label>
          <select id="schedule-filter" value={filterCatId} onChange={(event) => setFilterCatId(event.target.value)}>
            <option value="">All cats</option>
            {(catsQuery.data ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
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
        <ScheduleForm
          cats={catsQuery.data ?? []}
          form={createForm}
          setForm={setCreateForm}
          submitLabel={createMutation.isPending ? 'Saving…' : 'Create schedule'}
          onSubmit={() => createMutation.mutate()}
        />
        {formError && <div className="error-state">{formError}</div>}
      </section>

      {schedulesQuery.isLoading ? (
        <div className="loading-state">Loading schedules…</div>
      ) : schedulesQuery.isError ? (
        <div className="error-state">{schedulesQuery.error instanceof Error ? schedulesQuery.error.message : 'Unable to load schedules.'}</div>
      ) : (schedulesQuery.data ?? []).length === 0 ? (
        <div className="empty-state">No schedules found for the current filter.</div>
      ) : (
        <div className="card-grid">
          {(schedulesQuery.data ?? []).map((schedule) => (
            <article key={schedule.id} className="panel">
              {editingId === schedule.id ? (
                <ScheduleForm
                  cats={catsQuery.data ?? []}
                  form={editingForm}
                  setForm={setEditingForm}
                  submitLabel={updateMutation.isPending ? 'Saving…' : 'Update schedule'}
                  onSubmit={() => updateMutation.mutate({ id: schedule.id, form: editingForm })}
                  onCancel={() => setEditingId(null)}
                  disableCatSelection
                />
              ) : (
                <>
                  <div className="entry-card-header">
                    <div>
                      <h3>{schedule.name}</h3>
                      <p className="muted-text">{catNames.get(schedule.cat_id) ?? 'Unknown cat'}</p>
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
                          cat_id: schedule.cat_id,
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

function formatRules(schedule: Schedule) {
  try {
    return JSON.stringify(JSON.parse(schedule.rules_json), null, 2);
  } catch {
    return schedule.rules_json;
  }
}

function ScheduleForm({
  cats,
  form,
  setForm,
  onSubmit,
  submitLabel,
  onCancel,
  disableCatSelection = false,
}: {
  cats: { id: string; name: string }[];
  form: ScheduleFormState;
  setForm: React.Dispatch<React.SetStateAction<ScheduleFormState>>;
  onSubmit: () => void;
  submitLabel: string;
  onCancel?: () => void;
  disableCatSelection?: boolean;
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
        <label htmlFor="schedule-cat">Cat</label>
        <select
          id="schedule-cat"
          value={form.cat_id}
          onChange={(event) => setForm((current) => ({ ...current, cat_id: event.target.value }))}
          disabled={disableCatSelection}
          required
        >
          <option value="">Select a cat</option>
          {cats.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
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
