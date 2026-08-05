import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePermissions } from '../context/usePermissions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { daysApi } from '../api/days';
import {
  eliminationApi,
  type CreateEliminationRecord,
  type EliminationEventType,
  type EliminationRecord,
  type UpdateEliminationRecord,
} from '../api/elimination';
import { TimeInput } from './TimeInput';
import { EliminationDayChart } from './EliminationDayChart';
import { nowTimeString, isoFromDateAndTime } from '../lib/time';
import { localToday } from '../lib/dates';
import { useFormatTime, useFormatDate } from '../context/useDisplaySettings';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { digitsToDisplay, digitsToSecs, secsToDigits, normaliseDigits } from '../lib/duration';

// ── Label maps ──────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<EliminationEventType, string> = {
  general: 'General',
  urination: 'Wee',
  defecation: 'Poop',
  vomit: 'Vomit',
};

const EVENT_TYPE_BADGE_COLOR: Record<EliminationEventType, string> = {
  general:    'var(--text-muted)',
  urination:  'var(--metric-water)',
  defecation: 'var(--metric-wet)',
  vomit:      'var(--error-text)',
};

const DEFECATION_SUBTYPES: Array<{ value: string; label: string }> = [
  { value: 'normal',  label: 'Normal' },
  { value: 'soft',    label: 'Soft' },
  { value: 'liquid',  label: 'Liquid' },
  { value: 'hard',    label: 'Hard' },
  { value: 'blood',   label: 'Blood' },
  { value: 'mucus',   label: 'Mucus' },
];

const VOMIT_SUBTYPES: Array<{ value: string; label: string }> = [
  { value: 'food',          label: 'Food' },
  { value: 'fur',           label: 'Fur / Hairball' },
  { value: 'fur_with_food', label: 'Fur with food' },
  { value: 'bile',          label: 'Bile' },
  { value: 'other', label: 'Other' },
];

const EVENT_TYPES: EliminationEventType[] = ['general', 'urination', 'defecation', 'vomit'];


// ── DurationInput ─────────────────────────────────────────────────────────────

interface DurationInputProps {
  digits: string;
  onChange: (digits: string) => void;
}

function DurationInput({ digits, onChange }: DurationInputProps) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className="record-entry-duration"
      aria-label="Duration (MM:SS)"
      value={digitsToDisplay(digits)}
      onKeyDown={(e) => {
        if (e.key === 'Backspace') {
          onChange(digits.slice(0, -1));
          e.preventDefault();
        }
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        const newDigit = raw.slice(-1);
        if (newDigit && digits.length < 4) {
          onChange(digits + newDigit);
        }
      }}
      onBlur={() => onChange(normaliseDigits(digits))}
    />
  );
}

function fmtDurationSecs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function subtypesFor(eventType: EliminationEventType) {
  if (eventType === 'defecation') return DEFECATION_SUBTYPES;
  if (eventType === 'vomit') return VOMIT_SUBTYPES;
  return null;
}


function invalidateDayData(queryClient: ReturnType<typeof useQueryClient>, date: string, petId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['day-summary', date, petId] }),
    queryClient.invalidateQueries({ queryKey: ['elimination-records-day', date, petId] }),
    queryClient.invalidateQueries({ queryKey: ['elimination-calendar'] }),
    queryClient.invalidateQueries({ queryKey: ['elimination-analytics'] }),
  ]);
}

// ── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({
  eventType,
  autoCategorized = false,
  autoCategorizeConfidence = null,
}: {
  eventType: EliminationEventType;
  autoCategorized?: boolean;
  autoCategorizeConfidence?: number | null;
}) {
  const confidencePct =
    autoCategorizeConfidence != null ? Math.round(autoCategorizeConfidence * 100) : null;
  const autoLabel =
    confidencePct != null
      ? `Auto-detected (${confidencePct}% confidence)`
      : 'Auto-detected';

  return (
    <span className="type-badge-wrap">
      <span
        className="badge badge-muted"
        style={{ color: EVENT_TYPE_BADGE_COLOR[eventType], background: `${EVENT_TYPE_BADGE_COLOR[eventType]}1a`, fontSize: '0.75rem', padding: '0.2rem 0.55rem' }}
      >
        {EVENT_TYPE_LABELS[eventType]}
      </span>
      {autoCategorized && (
        <span className="auto-tag-icon" title={autoLabel} aria-label={autoLabel}>
          {confidencePct != null ? `${confidencePct}%` : 'A'}
        </span>
      )}
    </span>
  );
}

// ── Categorize last general visit ─────────────────────────────────────────────

interface CategorizeBarProps {
  onCategorize: (eventType: 'urination' | 'defecation') => void;
  pending: boolean;
}

function CategorizeBar({ onCategorize, pending }: CategorizeBarProps) {
  return (
    <div className="categorize-last-visit">
      <span className="categorize-last-visit-label">Last visit uncategorized — was it:</span>
      <div className="categorize-last-visit-actions">
        <button
          className="button categorize-button categorize-button-wee"
          type="button"
          disabled={pending}
          onClick={() => onCategorize('urination')}
        >
          Wee
        </button>
        <button
          className="button categorize-button categorize-button-poop"
          type="button"
          disabled={pending}
          onClick={() => onCategorize('defecation')}
        >
          Poop
        </button>
      </div>
    </div>
  );
}

// ── Add row ──────────────────────────────────────────────────────────────────

interface AddRowProps {
  date: string;
  petId: string;
  onSave: (payload: CreateEliminationRecord) => void;
  saving: boolean;
  isPaused: boolean;
  /** Block create while a row is being edited (avoids mobile select/save ghost-clicks). */
  disabled?: boolean;
}

export interface AddRowHandle {
  clearForm: () => void;
}

const AddRow = forwardRef<AddRowHandle, AddRowProps>(function AddRow(
  { date, petId, onSave, saving, isPaused, disabled = false },
  ref,
) {
  const [time, setTime] = useState(nowTimeString);
  const [eventType, setEventType] = useState<EliminationEventType>('urination');
  const [subtype, setSubtype] = useState('');
  const [durationDigits, setDurationDigits] = useState('');
  const [note, setNote] = useState('');

  const availableSubtypes = subtypesFor(eventType);
  const controlsDisabled = saving || disabled;

  useImperativeHandle(ref, () => ({
    clearForm() {
      setTime(nowTimeString());
      setSubtype('');
      setDurationDigits('');
      setNote('');
    },
  }));

  function handleAdd() {
    if (controlsDisabled) return;
    onSave({
      pet_id: petId,
      occurred_at: isoFromDateAndTime(date, time),
      local_date: date,
      event_type: eventType,
      subtype: subtype || null,
      duration_seconds: digitsToSecs(durationDigits),
      note: note.trim() || null,
      source_type: 'manual',
    });
  }

  return (
    <div
      className="record-entry-form record-entry-form--elimination"
      // pointer-events:none so a ghost click after native <select> dismiss
      // cannot land on Log visit while a row is being edited.
      style={disabled ? { pointerEvents: 'none', opacity: 0.55 } : undefined}
      aria-disabled={disabled || undefined}
    >
      <div className="form-row">
        <label>Time</label>
        <TimeInput value={time} onChange={setTime} variant="form" />
      </div>
      <div className="form-row">
        <label>Type</label>
        <div className="record-entry-type-stack">
          <select
            aria-label="Event type"
            value={eventType}
            disabled={controlsDisabled}
            onChange={(e) => { setEventType(e.target.value as EliminationEventType); setSubtype(''); }}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
          {availableSubtypes && (
            <select
              aria-label="Subtype"
              value={subtype}
              disabled={controlsDisabled}
              onChange={(e) => setSubtype(e.target.value)}
            >
              <option value="">— subtype —</option>
              {availableSubtypes.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="form-row">
        <label>Duration</label>
        <DurationInput digits={durationDigits} onChange={setDurationDigits} />
      </div>
      <div className="form-row">
        <label>Note</label>
        <input
          type="text"
          aria-label="Note"
          placeholder="Optional"
          value={note}
          disabled={controlsDisabled}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
        />
      </div>
      <button
        className="button"
        type="button"
        disabled={controlsDisabled}
        onClick={handleAdd}
      >
        {disabled ? 'Editing…' : isPaused ? 'Offline…' : saving ? 'Saving…' : 'Log visit'}
      </button>
    </div>
  );
});

// ── Record row ───────────────────────────────────────────────────────────────

interface RecordRowProps {
  record: EliminationRecord;
  onSave: (id: string, payload: UpdateEliminationRecord) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  savingPaused: boolean;
  deleting: boolean;
  deletingPaused: boolean;
  canWrite: boolean;
  onEditingChange?: (editing: boolean) => void;
}

function RecordRow({
  record,
  onSave,
  onDelete,
  saving,
  savingPaused,
  deleting,
  deletingPaused,
  canWrite,
  onEditingChange,
}: RecordRowProps) {
  const formatTime = useFormatTime();
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState('');
  const [eventType, setEventType] = useState<EliminationEventType>('general');
  const [subtype, setSubtype] = useState('');
  const [durationDigits, setDurationDigits] = useState('');
  const [note, setNote] = useState('');

  const availableSubtypes = subtypesFor(eventType);

  function setEditingState(next: boolean) {
    setEditing(next);
    onEditingChange?.(next);
  }

  function startEdit() {
    setTime(record.occurred_at.slice(11, 16));
    setEventType(record.event_type);
    setSubtype(record.subtype ?? '');
    setDurationDigits(record.duration_seconds != null ? secsToDigits(record.duration_seconds) : '');
    setNote(record.note ?? '');
    setEditingState(true);
  }

  function commitEdit() {
    onSave(record.id, {
      occurred_at: isoFromDateAndTime(record.local_date, time),
      local_date: record.local_date,
      event_type: eventType,
      subtype: subtype || null,
      duration_seconds: digitsToSecs(durationDigits),
      note: note.trim() || null,
    });
    setEditingState(false);
  }

  if (editing) {
    return (
      <div className="entry-row-wrap entry-row-editing">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.25rem 0' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <TimeInput value={time} onChange={setTime} autoFocus />
            <select
              className="entry-inline-input entry-inline-select"
              aria-label="Event type"
              value={eventType}
              onChange={(e) => { setEventType(e.target.value as EliminationEventType); setSubtype(''); }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {availableSubtypes && (
              <select
                className="entry-inline-input entry-inline-select"
                aria-label="Subtype"
                value={subtype}
                onChange={(e) => setSubtype(e.target.value)}
              >
                <option value="">— subtype —</option>
                {availableSubtypes.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
            <DurationInput digits={durationDigits} onChange={setDurationDigits} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="entry-inline-input"
              style={{ flex: 1, minWidth: '10rem' }}
              type="text"
              aria-label="Note"
              placeholder="note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingState(false); }}
            />
            <div className="entry-row-actions">
              <button className="icon-button" type="button" title="Save" aria-label="Save" disabled={saving} onClick={commitEdit}>
                {savingPaused ? '⏸' : saving ? '…' : '✓'}
              </button>
              <button className="icon-button" type="button" title="Cancel" aria-label="Cancel" onClick={() => setEditingState(false)}>
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="entry-row-wrap" id={`record-${record.id}`}>
      <div className="entry-row">
        <span className="entry-time">{formatTime(record.occurred_at)}</span>
        <TypeBadge
          eventType={record.event_type}
          autoCategorized={record.is_auto_categorized}
          autoCategorizeConfidence={record.auto_categorize_confidence}
        />
        <span className="entry-amount" style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          {record.subtype ? record.subtype : ''}
          {record.duration_seconds != null ? ` ${fmtDurationSecs(record.duration_seconds)}` : ''}
        </span>
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

// ── Day panel ────────────────────────────────────────────────────────────────

interface EliminationDayPanelProps {
  date: string;
  petId: string;
}

export function EliminationDayPanel({ date, petId }: EliminationDayPanelProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const [noteDraft, setNoteDraft] = useState('');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const addRowRef = useRef<AddRowHandle>(null);
  const formatDate = useFormatDate();

  const summaryQuery = useQuery({
    queryKey: ['day-summary', date, petId],
    queryFn: () => daysApi.getSummary(date, petId),
    enabled: Boolean(petId),
  });

  const recordsQuery = useQuery({
    queryKey: ['elimination-records-day', date, petId],
    queryFn: () => eliminationApi.list({ date, pet_id: petId }),
    enabled: Boolean(petId),
  });

  const records = useMemo(
    () => [...(recordsQuery.data ?? [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [recordsQuery.data],
  );

  useScrollToHash(petId, records.length, recordsQuery.isSuccess);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteDraft(summaryQuery.data?.note ?? '');
  }, [summaryQuery.data?.note]);

  // Derived metrics — vomit is shown separately, not counted as a visit
  const totalCount = records.filter((r) => r.event_type !== 'vomit').length;
  const defecationCount = records.filter((r) => r.event_type === 'defecation').length;
  const vomitCount = records.filter((r) => r.event_type === 'vomit').length;
  const durRecords = records.filter((r) => r.duration_seconds != null);
  const avgDurationSec = durRecords.length > 0
    ? durRecords.reduce((s, r) => s + (r.duration_seconds ?? 0), 0) / durRecords.length
    : null;
  const latestRecord = records[0];
  const showCategorizeBar = canWrite && latestRecord?.event_type === 'general';

  const createMutation = useMutation({
    mutationFn: (payload: CreateEliminationRecord) => eliminationApi.create(payload),
    onSuccess: () => {
      invalidateDayData(queryClient, date, petId);
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      addRowRef.current?.clearForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEliminationRecord }) =>
      eliminationApi.update(id, payload),
    onSuccess: () => invalidateDayData(queryClient, date, petId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => eliminationApi.delete(id),
    onSuccess: () => invalidateDayData(queryClient, date, petId),
  });

  const noteMutation = useMutation({
    mutationFn: () => daysApi.updateNote(date, noteDraft, petId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['day-summary', date, petId] }),
  });

  if (recordsQuery.isLoading) {
    return <div className="loading-state">Loading day log…</div>;
  }

  if (recordsQuery.isError) {
    const message = recordsQuery.error instanceof Error ? recordsQuery.error.message : 'Unable to load records.';
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
          <Link to="/elimination" style={{ fontSize: '0.82rem', color: 'var(--text-subtle)' }}>
            ← today
          </Link>
        )}
      </div>

      {/* Metric cards — 4 per row, compact */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, max-content))', gap: '0.75rem' }}>
        <article className="metric-card">
          <span className="metric-label">Visits</span>
          <strong style={{ fontFamily: 'monospace', fontSize: '1.65rem' }}>
            {totalCount}
          </strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Poops</span>
          <strong style={{ fontFamily: 'monospace', fontSize: '1.65rem', color: 'var(--metric-wet)' }}>
            {defecationCount}
          </strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Avg time</span>
          <strong style={{ fontFamily: 'monospace', fontSize: avgDurationSec != null ? '1.2rem' : '1.65rem', color: 'var(--text-muted)' }}>
            {avgDurationSec != null ? fmtDurationSecs(avgDurationSec) : '—'}
          </strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Vomit</span>
          <strong style={{ fontFamily: 'monospace', fontSize: '1.65rem', color: vomitCount > 0 ? 'var(--error-text)' : 'var(--text-subtle)' }}>
            {vomitCount}
          </strong>
        </article>
      </div>

      {records.length > 0 && <EliminationDayChart records={records} />}

      {/* Entry list */}
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
            disabled={editingRecordId != null || updateMutation.isPending}
            onSave={(payload) => createMutation.mutate(payload)}
          />
        )}

        {showCategorizeBar && latestRecord && editingRecordId == null && (
          <CategorizeBar
            pending={updateMutation.isPending && updateMutation.variables?.id === latestRecord.id}
            onCategorize={(eventType) =>
              updateMutation.mutate({ id: latestRecord.id, payload: { event_type: eventType } })
            }
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
                onEditingChange={(editing) => setEditingRecordId(editing ? record.id : null)}
                canWrite={canWrite}
              />
            ))}
          </div>
        )}
      </div>

      {/* Day note */}
      {canWrite && (
        <div className="day-note-block">
          <label htmlFor={`elim-day-note-${date}`}>Day note</label>
          <textarea
            id={`elim-day-note-${date}`}
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
    </section>
  );
}
