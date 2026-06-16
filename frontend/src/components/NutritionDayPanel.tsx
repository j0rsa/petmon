import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionAnalyticsApi } from '../api/analytics';
import { daysApi } from '../api/days';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { nutritionSchedulesApi } from '../api/nutritionSchedules';
import { CategoryBadge } from './CategoryBadge';
import { CumulativeFluidChart } from './CumulativeFluidChart';
import { IntakeBarsChart } from './IntakeBarsChart';
import { formatDisplayDate } from '../lib/dates';
import { exportTelegramLog } from '../lib/exportTelegramLog';
import { highlightFromSummary, totalKnownFluidMl } from '../lib/nutritionMetrics';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { CreateNutritionRecord, NutritionRecord, UpdateNutritionRecord } from '../types';

const UNIT_FOR_CATEGORY: Record<string, string> = {
  wet_food: 'g',
  dry_food: 'g',
  water: 'ml',
  liquids: 'ml',
};

function unitFor(category: string) {
  return UNIT_FOR_CATEGORY[category] ?? '';
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function nowTimeString() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
}

function isoFromDateAndTime(date: string, time: string) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function timeFromIso(iso: string) {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function invalidateDayData(queryClient: ReturnType<typeof useQueryClient>, date: string, petId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['day-summary', date, petId] }),
    queryClient.invalidateQueries({ queryKey: ['nutrition-records-day', date, petId] }),
    queryClient.invalidateQueries({ queryKey: ['nutrition-analytics'] }),
    queryClient.invalidateQueries({ queryKey: ['nutrition-calendar'] }),
  ]);
}

// ── Inline add row ──────────────────────────────────────────────────────────

interface AddRowProps {
  date: string;
  petId: string;
  onSave: (payload: CreateNutritionRecord) => void;
  saving: boolean;
}

function AddRow({ date, petId, onSave, saving }: AddRowProps) {
  const [time, setTime] = useState(nowTimeString);
  const [category, setCategory] = useState<string>('liquids');
  const [amount, setAmount] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    const n = Number(amount);
    if (!amount || isNaN(n) || n <= 0) return;
    onSave({
      pet_id: petId,
      occurred_at: isoFromDateAndTime(date, time),
      local_date: date,
      category,
      amount: n,
      unit: unitFor(category),
    });
    setAmount('');
    amountRef.current?.focus();
  }

  return (
    <div className="entry-add-row">
      <input
        className="entry-inline-input entry-inline-time"
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      <select
        className="entry-inline-input entry-inline-select"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
        ))}
      </select>
      <input
        ref={amountRef}
        className="entry-inline-input entry-inline-amount"
        type="number"
        min="0"
        step="0.1"
        placeholder="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
      />
      <span className="entry-unit-hint">{unitFor(category)}</span>
      <button
        className="button button-secondary button-compact"
        type="button"
        disabled={saving || !amount}
        onClick={handleAdd}
      >
        {saving ? '…' : '+ add'}
      </button>
    </div>
  );
}

// ── Single record row ───────────────────────────────────────────────────────

interface RecordRowProps {
  record: NutritionRecord;
  onSave: (id: string, payload: UpdateNutritionRecord) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}

function RecordRow({ record, onSave, onDelete, saving, deleting }: RecordRowProps) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');

  function startEdit() {
    setTime(timeFromIso(record.occurred_at));
    setCategory(record.category);
    setAmount(String(record.amount));
    setEditing(true);
  }

  function commitEdit() {
    onSave(record.id, {
      occurred_at: isoFromDateAndTime(record.local_date, time),
      local_date: record.local_date,
      category,
      amount: Number(amount),
      unit: unitFor(category),
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="entry-row-wrap entry-row-editing">
        <div className="entry-row">
          <input
            className="entry-inline-input entry-inline-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            autoFocus
          />
          <select
            className="entry-inline-input entry-inline-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <input
            className="entry-inline-input entry-inline-amount"
            type="number"
            min="0"
            step="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
          />
          <span className="entry-unit-hint">{unitFor(category)}</span>
          <div className="entry-row-actions">
            <button className="icon-button" type="button" title="Save" disabled={saving} onClick={commitEdit}>
              {saving ? '…' : '✓'}
            </button>
            <button className="icon-button" type="button" title="Cancel" onClick={() => setEditing(false)}>
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="entry-row-wrap">
      <div className="entry-row">
        <span className="entry-time">{formatTime(record.occurred_at)}</span>
        <CategoryBadge category={record.category} />
        <span className="entry-amount">{record.amount} {record.unit ?? ''}</span>
        <div className="entry-row-actions">
          <button className="icon-button" type="button" title="Edit" onClick={startEdit}>✎</button>
          <button
            className="icon-button icon-button-danger"
            type="button"
            title="Delete"
            disabled={deleting}
            onClick={() => { if (window.confirm('Delete this record?')) onDelete(record.id); }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day panel ───────────────────────────────────────────────────────────────

interface NutritionDayPanelProps {
  date: string;
  petId: string;
}

export function NutritionDayPanel({ date, petId }: NutritionDayPanelProps) {
  const queryClient = useQueryClient();
  const [noteDraft, setNoteDraft] = useState('');

  const summaryQuery = useQuery({
    queryKey: ['day-summary', date, petId],
    queryFn: () => daysApi.getSummary(date, petId),
    enabled: Boolean(petId),
  });

  const recordsQuery = useQuery({
    queryKey: ['nutrition-records-day', date, petId],
    queryFn: () => nutritionRecordsApi.list({ date, pet_id: petId }),
    enabled: Boolean(petId),
  });

  const schedulesQuery = useQuery({
    queryKey: ['nutrition-schedules', petId],
    queryFn: () => nutritionSchedulesApi.list(petId),
    enabled: Boolean(petId),
  });

  const bestDayQuery = useQuery({
    queryKey: ['nutrition-best-fluid-day', date, petId],
    queryFn: () => nutritionAnalyticsApi.bestFluidDay(date, petId),
    enabled: Boolean(petId),
  });

  useEffect(() => {
    setNoteDraft(summaryQuery.data?.note ?? '');
  }, [summaryQuery.data?.note]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateNutritionRecord) => nutritionRecordsApi.create(payload),
    onSuccess: () => invalidateDayData(queryClient, date, petId),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateNutritionRecord }) =>
      nutritionRecordsApi.update(id, payload),
    onSuccess: () => invalidateDayData(queryClient, date, petId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => nutritionRecordsApi.delete(id),
    onSuccess: () => invalidateDayData(queryClient, date, petId),
  });

  const noteMutation = useMutation({
    mutationFn: () => daysApi.updateNote(date, noteDraft, petId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['day-summary', date, petId] }),
  });

  const records = useMemo(
    () => [...(recordsQuery.data ?? [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [recordsQuery.data],
  );

  const highlight = summaryQuery.data ? highlightFromSummary(summaryQuery.data) : null;
  const totalFluid = highlight ? totalKnownFluidMl(highlight) : 0;
  const fluidFromFood = highlight ? Math.round(highlight.wetFood * 0.77) : 0;

  if (summaryQuery.isLoading) {
    return <div className="loading-state">Loading day log…</div>;
  }

  if (summaryQuery.isError) {
    const message = summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Unable to load day summary.';
    return <div className="error-state">{message}</div>;
  }

  return (
    <section className="panel day-panel">
      <div className="day-panel-header">
        <div>
          <p className="eyebrow">Selected day</p>
          <h3>{formatDisplayDate(date)}</h3>
        </div>
      </div>

      <div className="metric-cards">
        <article className="metric-card metric-card-water">
          <span className="metric-label">Liquids</span>
          <strong>{Math.round(highlight?.liquids ?? 0)}<span>ml</span></strong>
        </article>
        <article className="metric-card metric-card-water">
          <span className="metric-label">Water</span>
          <strong>{Math.round(highlight?.water ?? 0)}<span>ml</span></strong>
        </article>
        <article className="metric-card metric-card-wet">
          <span className="metric-label">Wet food</span>
          <strong>{Math.round(highlight?.wetFood ?? 0)}<span>g</span></strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Total known fluid</span>
          <strong>~{totalFluid}<span>ml</span></strong>
        </article>
      </div>

      {(highlight?.wetFood ?? 0) > 0 || (highlight?.water ?? 0) > 0 || (highlight?.liquids ?? 0) > 0 ? (
        <p className="fluid-summary">
          <strong>{fluidFromFood} ml</strong> from wet food +{' '}
          <strong>{Math.round(highlight?.liquids ?? 0)} ml</strong> liquids +{' '}
          <strong>{Math.round(highlight?.water ?? 0)} ml</strong> water ={' '}
          <strong>~{totalFluid} ml</strong> total known fluid
        </p>
      ) : null}

      {records.length > 0 && (
        <div className="day-charts-section">
          <div className="day-chart-block">
            <p className="eyebrow chart-label">fluid intake over time</p>
            <IntakeBarsChart records={records} />
          </div>
          <div className="day-chart-block">
            <p className="eyebrow chart-label">cumulative fluid by time of day</p>
            <CumulativeFluidChart
              records={records}
              focusDate={date}
              schedules={schedulesQuery.data ?? []}
              bestDayCurve={bestDayQuery.data?.curve}
              bestDayDate={bestDayQuery.data?.local_date}
            />
          </div>
        </div>
      )}

      <div className="entries-section">
        <div className="entries-section-header">
          <span className="eyebrow">Entries</span>
          <span className="muted-text">{records.length} logged</span>
        </div>

        {records.length === 0 ? (
          <div className="empty-state compact-empty">No records for this day yet.</div>
        ) : (
          <div className="entry-rows">
            {records.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                saving={updateMutation.isPending && updateMutation.variables?.id === record.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === record.id}
                onSave={(id, payload) => updateMutation.mutate({ id, payload })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        <AddRow
          date={date}
          petId={petId}
          saving={createMutation.isPending}
          onSave={(payload) => createMutation.mutate(payload)}
        />
      </div>

      {records.length > 0 && <ExportPanel records={records} />}

      <div className="day-note-block">
        <label htmlFor={`day-note-${date}`}>Day note</label>
        <textarea
          id={`day-note-${date}`}
          rows={3}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Notes for caregivers"
        />
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={() => noteMutation.mutate()}
          disabled={noteMutation.isPending}
        >
          {noteMutation.isPending ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </section>
  );
}

function ExportPanel({ records }: { records: NutritionRecord[] }) {
  const [copied, setCopied] = useState(false);
  const text = exportTelegramLog(records);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="day-note-block">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label>Export as Telegram log</label>
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <textarea
        rows={Math.min(records.length * 2 + 1, 10)}
        readOnly
        value={text}
        style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}
        onFocus={(e) => e.target.select()}
      />
    </div>
  );
}
