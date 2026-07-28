import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../context/usePermissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nutritionAnalyticsApi } from '../api/analytics';
import { daysApi } from '../api/days';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { nutritionSchedulesApi } from '../api/nutritionSchedules';
import { CategoryBadge } from './CategoryBadge';
import { CumulativeFluidChart } from './CumulativeFluidChart';
import { IntakeBarsChart } from './IntakeBarsChart';
import { TimeInput } from './TimeInput';
import { nowTimeString, isoFromDateAndTime, timeFromIso } from '../lib/time';
import { localToday, shiftDate } from '../lib/dates';
import { useDisplaySettings, useFormatDate, useFormatTime } from '../context/useDisplaySettings';
import { exportTelegramLog } from '../lib/exportTelegramLog';
import { LiquidsIcon, WaterIcon, WetFoodIcon, TotalFluidIcon } from '../lib/metricIcons';
import { highlightFromSummary, totalKnownFluidMl } from '../lib/nutritionMetrics';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { CreateNutritionRecord, NutritionRecord, UpdateNutritionRecord } from '../types';
import { parseAmountExpression, parseDecimal, parseWetFoodLiquidPair } from '../lib/numbers';

const UNIT_FOR_CATEGORY: Record<string, string> = {
  wet_food: 'g',
  dry_food: 'g',
  water: 'ml',
  liquids: 'ml',
};

/** UI-only entry mode: creates one wet_food + one liquids record. Not a backend category. */
const ENTRY_WET_FOOD_PLUS_LIQUID = 'wet_food_plus_liquid';

function unitFor(category: string) {
  if (category === ENTRY_WET_FOOD_PLUS_LIQUID) return 'g, ml';
  return UNIT_FOR_CATEGORY[category] ?? '';
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
  onSave: (payloads: CreateNutritionRecord[]) => void;
  saving: boolean;
  isPaused: boolean;
}

export interface AddRowHandle {
  clearForm: () => void;
}

const AddRow = forwardRef<AddRowHandle, AddRowProps>(function AddRow(
  { date, petId, onSave, saving, isPaused },
  ref,
) {
  const [time, setTime] = useState(nowTimeString);
  const [category, setCategory] = useState<string>(ENTRY_WET_FOOD_PLUS_LIQUID);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const amountRef = useRef<HTMLInputElement>(null);
  const isCombined = category === ENTRY_WET_FOOD_PLUS_LIQUID;

  useImperativeHandle(ref, () => ({
    clearForm() {
      setAmount('');
      setNote('');
      amountRef.current?.focus();
    },
  }));

  function handleAdd() {
    const occurredAt = isoFromDateAndTime(date, time);
    const noteValue = note.trim() || null;

    if (isCombined) {
      const pair = parseWetFoodLiquidPair(amount);
      if (!pair) return;
      onSave([
        {
          pet_id: petId,
          occurred_at: occurredAt,
          local_date: date,
          category: 'wet_food',
          amount: pair.wetFood,
          unit: unitFor('wet_food'),
          note: noteValue,
        },
        {
          pet_id: petId,
          occurred_at: occurredAt,
          local_date: date,
          category: 'liquids',
          amount: pair.liquids,
          unit: unitFor('liquids'),
          note: noteValue,
        },
      ]);
      // Form clears via ref.clearForm() called from createMutation.onSuccess,
      // so values are preserved while the mutation is paused offline.
      return;
    }

    const n = parseAmountExpression(amount);
    if (!amount.trim() || isNaN(n) || n <= 0) return;
    onSave([{
      pet_id: petId,
      occurred_at: occurredAt,
      local_date: date,
      category,
      amount: n,
      unit: unitFor(category),
      note: noteValue,
    }]);
    // Form clears via ref.clearForm() called from createMutation.onSuccess,
    // so values are preserved while the mutation is paused offline.
  }

  return (
    <div className="record-entry-form record-entry-form--nutrition">
      <div className="form-row">
        <label>Time</label>
        <TimeInput value={time} onChange={setTime} variant="form" />
      </div>
      <div className="form-row">
        <label>Category</label>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value={ENTRY_WET_FOOD_PLUS_LIQUID}>Wet food + Liquid</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Amount</label>
        <div className="record-entry-amount-wrap">
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            aria-label="Amount"
            placeholder={isCombined ? '123,456' : '130 or 450 - 320'}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <span className="entry-unit-hint">{unitFor(category)}</span>
        </div>
      </div>
      <div className="form-row">
        <label>Note</label>
        <input
          type="text"
          aria-label="Note"
          placeholder="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
      <button
        className="button"
        type="button"
        disabled={saving || !amount}
        onClick={handleAdd}
      >
        {isPaused ? 'Offline…' : saving ? 'Saving…' : 'Log intake'}
      </button>
    </div>
  );
});

// ── Single record row ───────────────────────────────────────────────────────

interface RecordRowProps {
  record: NutritionRecord;
  onSave: (id: string, payload: UpdateNutritionRecord) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  savingPaused: boolean;
  deleting: boolean;
  deletingPaused: boolean;
  canWrite: boolean;
  /** Storybook / tests: start in edit mode. */
  defaultEditing?: boolean;
}

function RecordRow({ record, onSave, onDelete, saving, savingPaused, deleting, deletingPaused, canWrite, defaultEditing = false }: RecordRowProps) {
  const formatTime = useFormatTime();
  const [editing, setEditing] = useState(defaultEditing);
  const [time, setTime] = useState(() => (defaultEditing ? timeFromIso(record.occurred_at) : ''));
  const [category, setCategory] = useState(() => (defaultEditing ? record.category : ''));
  const [amount, setAmount] = useState(() => (defaultEditing ? String(record.amount) : ''));
  const [note, setNote] = useState(() => (defaultEditing ? (record.note ?? '') : ''));

  function startEdit() {
    setTime(timeFromIso(record.occurred_at));
    setCategory(record.category);
    setAmount(String(record.amount));
    setNote(record.note ?? '');
    setEditing(true);
  }

  function buildPayload(localDate: string): UpdateNutritionRecord {
    return {
      occurred_at: isoFromDateAndTime(localDate, time),
      local_date: localDate,
      category,
      amount: parseDecimal(amount),
      unit: unitFor(category),
      note: note.trim() || null,
    };
  }

  function commitEdit() {
    onSave(record.id, buildPayload(record.local_date));
    setEditing(false);
  }

  function commitMoveDate(offset: number) {
    onSave(record.id, buildPayload(shiftDate(record.local_date, offset)));
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="entry-row-wrap entry-row-editing">
        <div className="record-entry-form record-entry-form--nutrition record-entry-form--edit">
          <div className="form-row">
            <label>Time</label>
            <TimeInput value={time} onChange={setTime} variant="form" autoFocus />
          </div>
          <div className="form-row">
            <label>Category</label>
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Amount</label>
            <div className="record-entry-amount-wrap">
              <input
                type="text"
                inputMode="decimal"
                aria-label="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
              />
              <span className="entry-unit-hint">{unitFor(category)}</span>
            </div>
          </div>
          <div className="form-row record-entry-form__note">
            <label>Note</label>
            <input
              type="text"
              aria-label="Note"
              placeholder="note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
            />
          </div>
          <div className="record-entry-form__actions">
            <button
              className="button button-secondary button-compact record-entry-form__move-day"
              type="button"
              disabled={saving}
              title={savingPaused ? 'Offline…' : 'Move to yesterday'}
              aria-label="Move to yesterday"
              onClick={() => commitMoveDate(-1)}
            >
              ⬅️🗓️
            </button>
            <button
              className="button button-secondary button-compact record-entry-form__move-day"
              type="button"
              disabled={saving}
              title={savingPaused ? 'Offline…' : 'Move to tomorrow'}
              aria-label="Move to tomorrow"
              onClick={() => commitMoveDate(1)}
            >
              ➡️🗓️
            </button>
            <button
              className="button button-compact"
              type="button"
              disabled={saving}
              onClick={commitEdit}
            >
              {savingPaused ? 'Offline…' : saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="button button-secondary button-compact"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
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
        {canWrite && (
          <div className="entry-row-actions">
            <button className="icon-button" type="button" title="Edit" aria-label="Edit" onClick={startEdit}>✎</button>
            <button
              className="icon-button icon-button-danger"
              type="button"
              title="Delete"
              aria-label="Delete"
              disabled={deleting}
              onClick={() => { if (window.confirm('Delete this record?')) onDelete(record.id); }}
            >
              {deletingPaused ? '⏸' : '✕'}
            </button>
          </div>
        )}
      </div>
      {record.note && (
        <p className="entry-record-note">{record.note}</p>
      )}
    </div>
  );
}

/** Exported for Storybook — inline nutrition record row with optional edit mode. */
export const NutritionRecordRow = RecordRow;

// ── Day panel ───────────────────────────────────────────────────────────────

interface NutritionDayPanelProps {
  date: string;
  petId: string;
}

export function NutritionDayPanel({ date, petId }: NutritionDayPanelProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const [noteDraft, setNoteDraft] = useState('');
  const { show_water_card } = useDisplaySettings();
  const addRowRef = useRef<AddRowHandle>(null);
  const formatDate = useFormatDate();

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteDraft(summaryQuery.data?.note ?? '');
  }, [summaryQuery.data?.note]);

  const createMutation = useMutation({
    mutationFn: async (payloads: CreateNutritionRecord[]) => {
      for (const payload of payloads) {
        await nutritionRecordsApi.create(payload);
      }
    },
    onSuccess: () => {
      invalidateDayData(queryClient, date, petId);
      addRowRef.current?.clearForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateNutritionRecord }) =>
      nutritionRecordsApi.update(id, payload),
    onSuccess: (_data, variables) => {
      const dates = new Set([date]);
      if (variables.payload.local_date) {
        dates.add(variables.payload.local_date);
      }
      return Promise.all([...dates].map((d) => invalidateDayData(queryClient, d, petId)));
    },
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
          <h3>{formatDate(date)}</h3>
        </div>
        {date !== localToday() && (
          <Link to="/nutrition" style={{ fontSize: '0.82rem', color: 'var(--text-subtle)' }}>
            ← today
          </Link>
        )}
      </div>

      <div className="metric-cards">
        <article className="metric-card metric-card-water" style={{ position: 'relative', overflow: 'hidden' }}>
          <MetricIcon color="var(--metric-water)"><LiquidsIcon /></MetricIcon>
          <span className="metric-label">Liquids</span>
          <strong>{Math.round(highlight?.liquids ?? 0)}<span>ml</span></strong>
        </article>
        {show_water_card && (
          <article className="metric-card metric-card-water" style={{ position: 'relative', overflow: 'hidden' }}>
            <MetricIcon color="var(--metric-water)"><WaterIcon /></MetricIcon>
            <span className="metric-label">Water</span>
            <strong>{Math.round(highlight?.water ?? 0)}<span>ml</span></strong>
          </article>
        )}
        <article className="metric-card metric-card-wet" style={{ position: 'relative', overflow: 'hidden' }}>
          <MetricIcon color="var(--metric-wet)"><WetFoodIcon /></MetricIcon>
          <span className="metric-label">Wet food</span>
          <strong>{Math.round(highlight?.wetFood ?? 0)}<span>g</span></strong>
        </article>
        <article className="metric-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <MetricIcon color="var(--fluid-accent)"><TotalFluidIcon /></MetricIcon>
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

        {canWrite && (
          <AddRow
            ref={addRowRef}
            date={date}
            petId={petId}
            saving={createMutation.isPending}
            isPaused={createMutation.isPaused}
            onSave={(payloads) => createMutation.mutate(payloads)}
          />
        )}

        {records.length === 0 ? (
          <div className="empty-state compact-empty">No records for this day yet.</div>
        ) : (
          <div className="entry-rows">
            {records.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                saving={updateMutation.isPending && updateMutation.variables?.id === record.id}
                savingPaused={updateMutation.isPaused && updateMutation.variables?.id === record.id}
                deleting={deleteMutation.isPending && deleteMutation.variables === record.id}
                deletingPaused={deleteMutation.isPaused && deleteMutation.variables === record.id}
                onSave={(id, payload) => updateMutation.mutate({ id, payload })}
                onDelete={(id) => deleteMutation.mutate(id)}
                canWrite={canWrite}
              />
            ))}
          </div>
        )}
      </div>

      {records.length > 0 && <ExportPanel records={records} />}

      {canWrite && (
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
      )}

      {records.length > 0 && (
        <section className="day-intake-chart-section">
          <p className="eyebrow chart-label">fluid intake over time</p>
          <IntakeBarsChart records={records} />
        </section>
      )}
    </section>
  );
}

function MetricIcon({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute',
      right: '0.6rem',
      bottom: '0.4rem',
      width: 44,
      height: 44,
      color,
      opacity: 0.1,
      pointerEvents: 'none',
    }}>
      {children}
    </div>
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
    <details className="export-telegram-details">
      <summary className="export-telegram-summary">
        <span>Export as Telegram log</span>
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={(e) => {
            e.preventDefault();
            handleCopy();
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </summary>
      <textarea
        rows={Math.min(records.length * 2 + 1, 10)}
        readOnly
        value={text}
        style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: 'var(--text-muted)' }}
        onFocus={(e) => e.target.select()}
      />
    </details>
  );
}
