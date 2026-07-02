import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { healthStateApi, type CreateHealthStateRecord, type HealthStateRecord } from '../../api/healthState';
import type { HealthStateLevel } from '../../lib/healthState';
import { healthStateEmoji, healthStateLabel } from '../../lib/healthState';
import { usePermissions } from '../../context/usePermissions';
import { HealthStatePicker } from './HealthStatePicker';

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

  const recordsQuery = useQuery({
    queryKey: ['health-state-records', petId],
    queryFn: () => healthStateApi.list({ pet_id: petId, limit: 90 }),
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
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => healthStateApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['health-state-records', petId] });
    },
  });

  const records = [...(recordsQuery.data ?? [])].sort((a, b) =>
    a.occurred_at.localeCompare(b.occurred_at),
  );
  const latest = records[records.length - 1];

  function handleAdd() {
    if (!level) return;
    addMutation.mutate({
      pet_id: petId,
      level,
      note: noteInput.trim() || undefined,
      occurred_at: occurredAt ? `${occurredAt}:00` : undefined,
    });
  }

  return (
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

      {canWrite && (
        <>
          <HealthStatePicker value={level} onChange={setLevel} disabled={addMutation.isPending} />

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
      )}

      {!canWrite && latest && (
        <HealthStatePicker value={latest.level} onChange={() => {}} disabled />
      )}

      {recordsQuery.isLoading ? (
        <div className="loading-state">Loading…</div>
      ) : records.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>State</th>
              <th>Note</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {[...records].reverse().map((record: HealthStateRecord) => (
              <tr key={record.id}>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{record.local_date}</td>
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
  );
}
