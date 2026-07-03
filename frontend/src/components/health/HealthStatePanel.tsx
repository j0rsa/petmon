import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { healthStateApi, type CreateHealthStateRecord, type HealthStateRecord } from '../../api/healthState';
import type { HealthStateLevel } from '../../lib/healthState';
import { healthStateEmoji, healthStateLabel } from '../../lib/healthState';
import type { HealthStateGranularity } from '../../lib/healthStateChart';
import { buildHealthStateSummary } from '../../lib/healthStateChart';
import { localToday, shiftDate } from '../../lib/dates';
import { useFormatDate, useFormatTime } from '../../context/useDisplaySettings';
import { usePermissions } from '../../context/usePermissions';
import { HealthStateChart } from './HealthStateChart';
import { HealthStatePicker } from './HealthStatePicker';

type PeriodLabel = '30d' | '90d' | '1y' | 'all';

const HEALTH_STATE_PERIODS: { label: PeriodLabel; days: number | null; granularity: HealthStateGranularity }[] = [
  { label: '30d', days: 30, granularity: 'daily' },
  { label: '90d', days: 90, granularity: 'daily' },
  { label: '1y', days: 365, granularity: 'weekly' },
  { label: 'all', days: null, granularity: 'weekly' },
];

function nowLocalDateTimeString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export interface HealthStatePanelProps {
  petId: string;
}

export function HealthStatePanel({ petId }: HealthStatePanelProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const formatDate = useFormatDate();
  const formatTime = useFormatTime();

  const [period, setPeriod] = useState<PeriodLabel>('30d');
  const today = localToday();
  const { days: periodDays, granularity } = HEALTH_STATE_PERIODS.find((p) => p.label === period)!;
  const dateFrom = periodDays != null ? shiftDate(today, -(periodDays - 1)) : undefined;

  const chartQuery = useQuery({
    queryKey: ['health-state-chart', petId, dateFrom ?? 'all', today, granularity],
    queryFn: () =>
      healthStateApi.list({
        pet_id: petId,
        date_from: dateFrom,
        date_to: today,
      }),
    enabled: Boolean(petId),
  });

  const recordsQuery = useQuery({
    queryKey: ['health-state-records', petId],
    queryFn: () => healthStateApi.list({ pet_id: petId }),
    enabled: Boolean(petId),
  });

  const [level, setLevel] = useState<HealthStateLevel | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => nowLocalDateTimeString());

  const addMutation = useMutation({
    mutationFn: (payload: CreateHealthStateRecord) => healthStateApi.create(payload),
    onSuccess: () => {
      setLevel(null);
      setNoteInput('');
      setOccurredAt(nowLocalDateTimeString());
      queryClient.invalidateQueries({ queryKey: ['health-state-records', petId] });
      queryClient.invalidateQueries({ queryKey: ['health-state-chart', petId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => healthStateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-state-records', petId] });
      queryClient.invalidateQueries({ queryKey: ['health-state-chart', petId] });
    },
  });

  const records = recordsQuery.data ?? [];
  const latest = records[0];
  const chartBuckets = buildHealthStateSummary(chartQuery.data ?? [], granularity);

  function handleAdd() {
    if (!level) return;
    addMutation.mutate({
      pet_id: petId,
      level,
      note: noteInput.trim() || undefined,
      occurred_at: occurredAt ? `${occurredAt}:00` : undefined,
    });
  }

  function formatRecordWhen(record: HealthStateRecord): string {
    return `${formatDate(record.local_date, 'short')} ${formatTime(record.occurred_at)}`;
  }

  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Wellbeing</p>
            <h3>Overall health</h3>
          </div>
          {latest && (
            <span
              className="health-state-latest"
              title={healthStateLabel(latest.level)}
              aria-label={`Latest: ${healthStateLabel(latest.level)}`}
            >
              <span aria-hidden="true">{healthStateEmoji(latest.level)}</span>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {HEALTH_STATE_PERIODS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`button${period === p.label ? '' : ' button-secondary'}`}
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.82rem' }}
              onClick={() => setPeriod(p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {chartQuery.isLoading ? (
          <div className="loading-state">Loading…</div>
        ) : chartBuckets.length >= 2 ? (
          <HealthStateChart buckets={chartBuckets} granularity={granularity} />
        ) : (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>
            {chartBuckets.length === 0
              ? 'No check-ins in this period.'
              : 'Add check-ins on at least 2 days to see a chart.'}
          </p>
        )}

        {canWrite ? (
          <>
            <HealthStatePicker value={level} onChange={setLevel} disabled={addMutation.isPending} />

            <div className="record-entry-form">
              <div className="form-row" style={{ flex: '0 0 auto' }}>
                <label style={{ fontSize: '0.82rem' }}>Date &amp; time</label>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  style={{ width: '13rem' }}
                />
              </div>
              <div className="form-row" style={{ flex: '1 1 140px' }}>
                <label style={{ fontSize: '0.82rem' }}>Note (optional)</label>
                <input
                  type="text"
                  placeholder="Energy, appetite, mood…"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && level && handleAdd()}
                />
              </div>
              <button
                className="button"
                type="button"
                disabled={addMutation.isPending || !level}
                onClick={handleAdd}
                style={{ alignSelf: 'flex-end' }}
              >
                {addMutation.isPending ? 'Saving…' : 'Log health'}
              </button>
            </div>
          </>
        ) : (
          latest && <HealthStatePicker value={latest.level} onChange={() => {}} disabled />
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h3>Recent check-ins</h3>
          </div>
          {records.length > 0 && (
            <span className="muted-text" style={{ fontSize: '0.82rem' }}>Last {records.length}</span>
          )}
        </div>

        {recordsQuery.isLoading ? (
          <div className="loading-state">Loading…</div>
        ) : records.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>State</th>
                <th>Note</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((record: HealthStateRecord) => (
                <tr key={record.id}>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {formatRecordWhen(record)}
                  </td>
                  <td>
                    <span className="health-state-record">
                      <span aria-hidden="true">{healthStateEmoji(record.level)}</span>
                      <span>{healthStateLabel(record.level)}</span>
                    </span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {record.note ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                  </td>
                  {canWrite && (
                    <td>
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                        disabled={deleteMutation.isPending && deleteMutation.variables === record.id}
                        onClick={() => {
                          if (window.confirm('Delete this health entry?')) {
                            deleteMutation.mutate(record.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>
            No health check-ins yet.
          </p>
        )}
      </section>
    </>
  );
}
