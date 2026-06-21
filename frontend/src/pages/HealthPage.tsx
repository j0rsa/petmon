import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { weightApi } from '../api/weight';
import type { CreateWeightRecord } from '../api/weight';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';

export default function HealthPage() {
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const queryClient = useQueryClient();

  const weightsQuery = useQuery({
    queryKey: ['weight-records', selectedPetId],
    queryFn: () => weightApi.list({ pet_id: selectedPetId!, limit: 90 }),
    enabled: Boolean(selectedPetId),
  });

  const [weightInput, setWeightInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const addMutation = useMutation({
    mutationFn: (payload: CreateWeightRecord) => weightApi.create(payload),
    onSuccess: () => {
      setWeightInput('');
      setNoteInput('');
      queryClient.invalidateQueries({ queryKey: ['weight-records', selectedPetId] });
      queryClient.invalidateQueries({ queryKey: ['pets', selectedPetId] });
      queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => weightApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight-records', selectedPetId] }),
  });

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  const records = [...(weightsQuery.data ?? [])]
    .filter((r) => r.local_date && r.weight_kg != null)
    .sort((a, b) => a.local_date.localeCompare(b.local_date));
  const chartData = records.map((r) => ({ date: r.local_date.slice(5), weight: r.weight_kg }));
  const latest = records[records.length - 1];

  function handleAdd() {
    const kg = parseFloat(weightInput);
    if (isNaN(kg) || kg <= 0 || !selectedPetId) return;
    addMutation.mutate({ pet_id: selectedPetId, weight_kg: kg, note: noteInput.trim() || undefined });
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

      {/* Weight chart */}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Weight</p>
            <h3>History</h3>
          </div>
        </div>

        {weightsQuery.isLoading ? (
          <div className="loading-state">Loading…</div>
        ) : records.length >= 2 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12 }}
                formatter={(v) => [`${v} kg`, 'Weight']}
              />
              <Line type="monotone" dataKey="weight" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted-text" style={{ fontSize: '0.88rem' }}>
            {records.length === 0 ? 'No measurements yet.' : 'Add at least 2 measurements to see a chart.'}
          </p>
        )}

        {/* Log weight */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-row" style={{ flex: '0 0 auto' }}>
            <label style={{ fontSize: '0.82rem' }}>Weight (kg)</label>
            <input
              type="number"
              step="0.01"
              min="0"
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
        </div>
      </section>

      {/* Records table */}
      {records.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Measurements</p>
              <h3>All records</h3>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Weight</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...records].reverse().map((r) => (
                <tr key={r.id}>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.local_date}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.weight_kg} kg</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {r.note ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
