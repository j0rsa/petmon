import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { weightApi } from '../api/weight';
import { parseDecimal } from '../lib/numbers';
import type { CreateWeightRecord, WeightGranularity } from '../api/weight';
import { NoPetSelected } from '../components/NoPetSelected';
import { HealthStatePanel } from '../components/health/HealthStatePanel';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';
import { usePermissions } from '../context/usePermissions';
import { useFormatDate, useFormatTime } from '../context/useDisplaySettings';

type PeriodLabel = '30d' | '90d' | '1y' | 'all';

const WEIGHT_PERIODS: { label: PeriodLabel; days: number | null; granularity: WeightGranularity }[] = [
  { label: '30d', days: 30,  granularity: 'raw'    },
  { label: '90d', days: 90,  granularity: 'daily'  },
  { label: '1y',  days: 365, granularity: 'weekly' },
  { label: 'all', days: null, granularity: 'weekly' },
];

function formatBucket(bucket: string, granularity: WeightGranularity): string {
  if (granularity === 'raw') {
    const dt = new Date(bucket);
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }
  const dt = new Date(`${bucket}T00:00:00`);
  return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
}

function nowLocalDateTimeString(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default function HealthPage() {
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const formatDate = useFormatDate();
  const formatTime = useFormatTime();

  const [period, setPeriod] = useState<PeriodLabel>('30d');
  const today = localToday();
  const { days: periodDays, granularity } = WEIGHT_PERIODS.find((p) => p.label === period)!;
  const dateFrom = periodDays != null ? shiftDate(today, -(periodDays - 1)) : undefined;

  const summaryQuery = useQuery({
    queryKey: ['weight-summary', dateFrom ?? 'all', today, granularity, selectedPetId],
    queryFn: () => weightApi.summary({
      pet_id: selectedPetId!,
      date_from: dateFrom,
      date_to: today,
      granularity,
    }),
    enabled: Boolean(selectedPetId),
  });

  const weightsQuery = useQuery({
    queryKey: ['weight-records', selectedPetId],
    queryFn: () => weightApi.list({ pet_id: selectedPetId!, limit: 10 }),
    enabled: Boolean(selectedPetId),
  });

  const [weightInput, setWeightInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [measuredAt, setMeasuredAt] = useState(() => nowLocalDateTimeString());

  const addMutation = useMutation({
    mutationFn: (payload: CreateWeightRecord) => weightApi.create(payload),
    onSuccess: () => {
      setWeightInput('');
      setNoteInput('');
      setMeasuredAt(nowLocalDateTimeString());
      queryClient.invalidateQueries({ queryKey: ['weight-records', selectedPetId] });
      queryClient.invalidateQueries({ queryKey: ['weight-summary'] });
      queryClient.invalidateQueries({ queryKey: ['pets', selectedPetId] });
      queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => weightApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-records', selectedPetId] });
      queryClient.invalidateQueries({ queryKey: ['weight-summary'] });
    },
  });

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  const records = (weightsQuery.data ?? []).filter((r) => r.local_date && r.weight_kg != null);
  const latest = records[0];

  function formatRecordWhen(measuredAt: string, localDate: string): string {
    return `${formatDate(localDate, 'short')} ${formatTime(measuredAt)}`;
  }

  const chartData = (summaryQuery.data ?? []).map((b) => ({
    bucket: formatBucket(b.bucket, granularity),
    avgKg: b.avg_kg,
    minKg: b.min_kg,
    maxKg: b.max_kg,
  }));

  function handleAdd() {
    const kg = parseDecimal(weightInput);
    if (isNaN(kg) || kg <= 0 || !selectedPetId) return;
    addMutation.mutate({
      pet_id: selectedPetId,
      weight_kg: kg,
      note: noteInput.trim() || undefined,
      measured_at: measuredAt ? measuredAt + ':00' : undefined,
    });
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Health</p>
          <h2>{selectedPet?.name ?? 'Pet'}</h2>
        </div>
        {latest && (
          <span style={{ fontFamily: 'monospace', fontSize: '1.6rem', color: 'var(--accent)' }}>
            {latest.weight_kg} kg
          </span>
        )}
      </section>

      <HealthStatePanel petId={selectedPetId} />

      {/* Weight chart */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Weight</p>
            <h3>History</h3>
          </div>
        </div>

        {/* Period selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {WEIGHT_PERIODS.map((p) => (
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

        {summaryQuery.isLoading ? (
          <div className="loading-state">Loading…</div>
        ) : chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12 }}
                formatter={(v, name) => {
                  const kg = Number(v ?? 0).toFixed(2);
                  if (name === 'Min' || name === 'Max') return [`${kg} kg`, name];
                  return [`${kg} kg`, granularity === 'raw' ? 'Weight' : 'Avg'];
                }}
              />
              {granularity !== 'raw' && (
                <>
                  <Line type="monotone" dataKey="minKg" name="Min" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" dot={false} strokeOpacity={0.35} legendType="none" />
                  <Line type="monotone" dataKey="maxKg" name="Max" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" dot={false} strokeOpacity={0.35} legendType="none" />
                </>
              )}
              <Line type="monotone" dataKey="avgKg" name={granularity === 'raw' ? 'Weight' : 'Avg'} stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>
            {chartData.length === 0 ? 'No measurements yet.' : 'Add at least 2 measurements to see a chart.'}
          </p>
        )}

        {/* Log weight */}
        {canWrite && <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: '0.82rem' }}>Date &amp; time</label>
            <input
              type="datetime-local"
              value={measuredAt}
              onChange={(e) => setMeasuredAt(e.target.value)}
              style={{ width: '13rem' }}
            />
          </div>
          <div className="form-row" style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: '0.82rem' }}>Weight (kg)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 4.35"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{ width: '9rem' }}
            />
          </div>
          <div className="form-row" style={{ flex: '1 1 140px' }}>
            <label style={{ fontSize: '0.82rem' }}>Note (optional)</label>
            <input
              type="text"
              placeholder="After meal, vet, etc."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button
            className="button"
            type="button"
            disabled={addMutation.isPending || !weightInput}
            onClick={handleAdd}
            style={{ alignSelf: 'flex-end' }}
          >
            {addMutation.isPending ? 'Saving…' : 'Log weight'}
          </button>
        </div>}
      </section>

      {/* Records table */}
      {records.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Measurements</p>
              <h3>Recent records</h3>
            </div>
            <span className="muted-text" style={{ fontSize: '0.82rem' }}>Last {records.length}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Weight</th>
                <th>Note</th>
                {canWrite && <th></th>}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{formatRecordWhen(r.measured_at, r.local_date)}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.weight_kg} kg</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {r.note ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                  </td>
                  {canWrite && (
                    <td>
                      <button
                        className="button button-danger"
                        type="button"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                        disabled={deleteMutation.isPending && deleteMutation.variables === r.id}
                        onClick={() => { if (window.confirm('Delete this weight entry?')) deleteMutation.mutate(r.id); }}
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
