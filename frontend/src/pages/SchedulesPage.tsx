import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionSchedulesApi } from '../api/nutritionSchedules';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import type { NutritionSchedule } from '../types';

type ScheduleType = 'liquid' | 'food';

interface TimeWindow {
  from: string;
  to: string;
  min: number;
  max: number;
  note: string;
}

interface ScheduleRules {
  type: ScheduleType;
  target_min?: number;
  target_max?: number;
  windows: TimeWindow[];
}

interface CreateForm {
  name: string;
  type: ScheduleType;
  target_min: string;
  target_max: string;
}

function parseRules(schedule: NutritionSchedule): ScheduleRules {
  try {
    const parsed = JSON.parse(schedule.rules_json);
    return {
      type: parsed.type === 'food' ? 'food' : 'liquid',
      target_min: parsed.target_min ?? parsed.target_min_ml,
      target_max: parsed.target_max ?? parsed.target_max_ml,
      windows: Array.isArray(parsed.windows)
        ? parsed.windows.map((w: Record<string, unknown>) => ({
            from: w.from ?? '',
            to: w.to ?? '',
            // support old min_ml/max_ml keys from existing seed data
            min: w.min ?? w.min_ml ?? 0,
            max: w.max ?? w.max_ml ?? 0,
            note: w.note ?? '',
          }))
        : [],
    };
  } catch {
    return { type: 'liquid', windows: [] };
  }
}

const UNIT: Record<ScheduleType, string> = { liquid: 'ml', food: 'g' };

const DEFAULT_RULES: Record<ScheduleType, ScheduleRules> = {
  liquid: { type: 'liquid', target_min: 79, target_max: 109, windows: [] },
  food: { type: 'food', target_min: 150, target_max: 200, windows: [] },
};

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    name: '',
    type: 'liquid',
    target_min: '',
    target_max: '',
  });

  const schedulesQuery = useQuery({
    queryKey: ['nutrition-schedules', selectedPetId],
    queryFn: () => nutritionSchedulesApi.list(selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const rules: ScheduleRules = {
        ...DEFAULT_RULES[createForm.type],
        target_min: createForm.target_min ? Number(createForm.target_min) : DEFAULT_RULES[createForm.type].target_min,
        target_max: createForm.target_max ? Number(createForm.target_max) : DEFAULT_RULES[createForm.type].target_max,
      };
      return nutritionSchedulesApi.create({
        pet_id: selectedPetId!,
        name: createForm.name,
        active: true,
        rules,
      });
    },
    onSuccess: async () => {
      setCreateForm({ name: '', type: 'liquid', target_min: '', target_max: '' });
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
  });

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  const schedules = schedulesQuery.data ?? [];
  const unit = UNIT[createForm.type];

  return (
    <div className="page-stack">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-strong)' }}>
          Feeding schedules for {selectedPet?.name ?? 'selected pet'}
        </h2>
        {!showCreate && (
          <button className="button" type="button" onClick={() => setShowCreate(true)}>
            + new schedule
          </button>
        )}
      </div>

      {showCreate && (
        <div className="panel" style={{ gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Name */}
            <input
              style={{ flex: '1 1 200px', maxWidth: 280 }}
              aria-label="Schedule name"
              placeholder="Schedule name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />

            {/* Type toggle */}
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {(['liquid', 'food'] as ScheduleType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`button${createForm.type === t ? '' : ' button-secondary'}`}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}
                  onClick={() => setCreateForm((f) => ({ ...f, type: t }))}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Target range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>target:</span>
              <input
                type="number"
                aria-label={`Minimum target in ${unit}`}
                placeholder={`min ${unit}`}
                value={createForm.target_min}
                onChange={(e) => setCreateForm((f) => ({ ...f, target_min: e.target.value }))}
                style={{ width: 90 }}
              />
              <span style={{ color: 'var(--text-subtle)' }}>–</span>
              <input
                type="number"
                aria-label={`Maximum target in ${unit}`}
                placeholder={`max ${unit}`}
                value={createForm.target_max}
                onChange={(e) => setCreateForm((f) => ({ ...f, target_max: e.target.value }))}
                style={{ width: 90 }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{unit} / day</span>
            </div>

            <button
              className="button"
              type="button"
              disabled={!createForm.name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create'}
            </button>
            <button className="button button-secondary" type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {schedulesQuery.isLoading ? (
        <div className="loading-state">Loading schedules…</div>
      ) : schedulesQuery.isError ? (
        <div className="error-state">
          {schedulesQuery.error instanceof Error ? schedulesQuery.error.message : 'Unable to load schedules.'}
        </div>
      ) : schedules.length === 0 ? (
        <div className="empty-state" style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
          No feeding schedules yet. Create one to get started.
        </div>
      ) : (
        schedules.map((schedule) => <ScheduleCard key={schedule.id} schedule={schedule} />)
      )}
    </div>
  );
}

function ScheduleCard({ schedule }: { schedule: NutritionSchedule }) {
  const queryClient = useQueryClient();
  const [rules, setRules] = useState<ScheduleRules>(() => parseRules(schedule));
  const [addRow, setAddRow] = useState<Partial<TimeWindow>>({ from: '08:00', to: '09:00', note: '' });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<TimeWindow | null>(null);

  const unit = UNIT[rules.type];

  const saveMutation = useMutation({
    mutationFn: (updated: ScheduleRules) =>
      nutritionSchedulesApi.update(schedule.id, { rules: updated }),
    onSuccess: async (_, updated) => {
      setRules(updated);
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => nutritionSchedulesApi.delete(schedule.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['nutrition-schedules'] });
    },
  });

  function saveRules(updated: ScheduleRules) {
    saveMutation.mutate(updated);
  }

  function addWindow() {
    if (!addRow.from || !addRow.to) return;
    const win: TimeWindow = {
      from: addRow.from,
      to: addRow.to,
      min: Number(addRow.min ?? 0),
      max: Number(addRow.max ?? 0),
      note: addRow.note ?? '',
    };
    saveRules({ ...rules, windows: [...rules.windows, win] });
    setAddRow({ from: '08:00', to: '09:00', note: '' });
  }

  function deleteWindow(index: number) {
    saveRules({ ...rules, windows: rules.windows.filter((_, i) => i !== index) });
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditRow({ ...rules.windows[index] });
  }

  function saveEdit() {
    if (editingIndex === null || !editRow) return;
    saveRules({ ...rules, windows: rules.windows.map((w, i) => (i === editingIndex ? editRow : w)) });
    setEditingIndex(null);
    setEditRow(null);
  }

  const target =
    rules.target_min != null && rules.target_max != null
      ? `${rules.target_min}–${rules.target_max} ${unit} / day`
      : null;

  return (
    <div className="panel" style={{ gap: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="badge badge-muted" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
            {rules.type}
          </span>
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{schedule.name}</span>
          {target && (
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>target: {target}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={`status-pill${schedule.active ? ' active' : ''}`}>
            {schedule.active ? 'Active' : 'Paused'}
          </span>
          <button
            className="button button-secondary"
            type="button"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }}
            onClick={() => saveRules(DEFAULT_RULES[rules.type])}
          >
            reset to default
          </button>
          <button
            className="button button-danger"
            type="button"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.9rem' }}
            disabled={deleteMutation.isPending}
            onClick={() => { if (window.confirm(`Delete "${schedule.name}"?`)) deleteMutation.mutate(); }}
          >
            delete
          </button>
        </div>
      </div>

      {/* Windows table */}
      <div style={{ background: 'var(--surface-inset)', borderRadius: 16, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
          time windows
        </div>

        {rules.windows.length === 0 && (
          <div style={{ padding: '1rem', color: 'var(--text-subtle)', fontSize: '0.88rem' }}>
            No time windows defined.
          </div>
        )}

        {rules.windows.map((win, index) =>
          editingIndex === index && editRow ? (
            <div key={index} style={{ display: 'flex', gap: '0.5rem', padding: '0.6rem 1rem', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              <input type="time" aria-label="From" value={editRow.from} onChange={(e) => setEditRow({ ...editRow, from: e.target.value })} style={{ width: 120 }} />
              <span style={{ color: 'var(--text-subtle)' }}>–</span>
              <input type="time" aria-label="To" value={editRow.to} onChange={(e) => setEditRow({ ...editRow, to: e.target.value })} style={{ width: 120 }} />
              <input type="number" aria-label={`Minimum ${unit}`} placeholder={`min ${unit}`} value={editRow.min || ''} onChange={(e) => setEditRow({ ...editRow, min: Number(e.target.value) })} style={{ width: 90 }} />
              <input type="number" aria-label={`Maximum ${unit}`} placeholder={`max ${unit}`} value={editRow.max || ''} onChange={(e) => setEditRow({ ...editRow, max: Number(e.target.value) })} style={{ width: 90 }} />
              <input aria-label="Note" placeholder="note" value={editRow.note} onChange={(e) => setEditRow({ ...editRow, note: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
              <button className="button" type="button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={saveEdit}>save</button>
              <button className="button button-secondary" type="button" style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }} onClick={() => { setEditingIndex(null); setEditRow(null); }}>cancel</button>
            </div>
          ) : (
            <WindowRow key={index} window={win} unit={unit} onEdit={() => startEdit(index)} onDelete={() => deleteWindow(index)} />
          )
        )}

        {/* Add row */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', alignItems: 'center', borderTop: rules.windows.length > 0 ? '1px solid var(--border-subtle)' : undefined, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>add:</span>
          <input type="time" aria-label="From" value={addRow.from ?? '08:00'} onChange={(e) => setAddRow({ ...addRow, from: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--text-subtle)' }}>–</span>
          <input type="time" aria-label="To" value={addRow.to ?? '09:00'} onChange={(e) => setAddRow({ ...addRow, to: e.target.value })} style={{ width: 120 }} />
          <input type="number" aria-label={`Minimum ${unit}`} placeholder={`min ${unit}`} value={addRow.min ?? ''} onChange={(e) => setAddRow({ ...addRow, min: Number(e.target.value) })} style={{ width: 90 }} />
          <input type="number" aria-label={`Maximum ${unit}`} placeholder={`max ${unit}`} value={addRow.max ?? ''} onChange={(e) => setAddRow({ ...addRow, max: Number(e.target.value) })} style={{ width: 90 }} />
          <input aria-label="Note" placeholder="note (optional)" value={addRow.note ?? ''} onChange={(e) => setAddRow({ ...addRow, note: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
          <button className="button" type="button" style={{ whiteSpace: 'nowrap' }} onClick={addWindow} disabled={saveMutation.isPending}>
            + add
          </button>
        </div>
      </div>
    </div>
  );
}

function WindowRow({ window: win, unit, onEdit, onDelete }: { window: TimeWindow; unit: string; onEdit: () => void; onDelete: () => void }) {
  const amount = win.min === win.max ? `${win.min} ${unit}` : `${win.min}–${win.max} ${unit}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '0.88rem', color: 'var(--text-muted)', minWidth: 110 }}>
        {win.from}–{win.to}
      </span>
      <span style={{ fontWeight: 700, minWidth: 90, fontSize: '0.95rem' }}>{amount}</span>
      <span style={{ flex: 1, color: 'var(--text-muted)', fontSize: '0.88rem' }}>{win.note}</span>
      <button type="button" onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '1rem' }} title="Edit">✏</button>
      <button type="button" onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '0.2rem 0.4rem', fontSize: '1rem' }} title="Delete">✕</button>
    </div>
  );
}
