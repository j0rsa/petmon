import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { petsApi } from '../api/pets';
import { weightApi } from '../api/weight';
import type { CreateWeightRecord, WeightRecord } from '../api/weight';
import { useSelectedPet } from '../context/SelectedPetContext';
import { PetAvatar } from '../components/pet/PetAvatar';
import { PetInfoFields } from '../components/pet/PetInfoFields';
import { formStateToPayload, PetInfoForm, petToFormState } from '../components/pet/PetInfoForm';
import { getPetPhoto, readPhotoFile, removePetPhoto, setPetPhoto } from '../lib/petPhotoStorage';
import { PET_SPECIES_LABELS } from '../types';

export default function PetInfoPage() {
  const { id = '' } = useParams();
  const { setSelectedPetId } = useSelectedPet();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(petToFormState({ name: '', species: 'cat', status: 'active' }));
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();

  const petQuery = useQuery({
    queryKey: ['pets', id],
    queryFn: () => petsApi.get(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (id) {
      setSelectedPetId(id);
    }
  }, [id, setSelectedPetId]);

  useEffect(() => {
    if (petQuery.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(petToFormState(petQuery.data));
      setPhotoUrl(getPetPhoto(petQuery.data.id));
    }
  }, [petQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => petsApi.update(id, formStateToPayload(form)),
    onSuccess: async () => {
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const weightsQuery = useQuery({
    queryKey: ['weight-records', id],
    queryFn: () => weightApi.list({ pet_id: id, limit: 90 }),
    enabled: Boolean(id),
  });

  if (petQuery.isLoading) {
    return <div className="loading-state">Loading pet profile…</div>;
  }

  if (petQuery.isError || !petQuery.data) {
    return (
      <div className="page-stack">
        <div className="error-state">{petQuery.error instanceof Error ? petQuery.error.message : 'Pet not found.'}</div>
        <Link className="button button-secondary" to="/pets">
          Back to pets
        </Link>
      </div>
    );
  }

  const pet = petQuery.data;

  return (
    <div className="page-stack pet-info-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Pet profile</p>
          <h2>{pet.name}</h2>
          <p className="muted-text">{PET_SPECIES_LABELS[pet.species]}{pet.breed ? ` · ${pet.breed}` : ''}</p>
        </div>
        <div className="button-row">
          <Link className="button button-secondary" to="/pets">
            All pets
          </Link>
          {!editing && (
            <button className="button" type="button" onClick={() => setEditing(true)}>
              Edit profile
            </button>
          )}
        </div>
      </section>

      {editing ? (
        <section className="panel">
          <PetInfoForm
            form={form}
            setForm={setForm}
            photoUrl={photoUrl}
            loading={updateMutation.isPending}
            submitLabel="Save profile"
            onCancel={() => {
              setEditing(false);
              setForm(petToFormState(pet));
              setPhotoUrl(getPetPhoto(pet.id));
            }}
            onSubmit={() => updateMutation.mutate()}
            onPhotoChange={async (file) => {
              const dataUrl = await readPhotoFile(file);
              setPetPhoto(pet.id, dataUrl);
              setPhotoUrl(dataUrl);
            }}
            onPhotoRemove={() => {
              removePetPhoto(pet.id);
              setPhotoUrl(undefined);
            }}
          />
        </section>
      ) : (
        <section className="panel pet-info-card">
          <PetAvatar species={pet.species} name={pet.name} color={pet.color} photoUrl={photoUrl} size={160} />
          <PetInfoFields pet={pet} />
        </section>
      )}
      <WeightPanel petId={id} weightsQuery={weightsQuery} queryClient={queryClient} />
    </div>
  );
}

function WeightPanel({ petId, weightsQuery, queryClient }: {
  petId: string;
  weightsQuery: UseQueryResult<WeightRecord[]>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [weightInput, setWeightInput] = useState('');
  const [noteInput, setNoteInput] = useState('');

  const addMutation = useMutation({
    mutationFn: (payload: CreateWeightRecord) => weightApi.create(payload),
    onSuccess: () => {
      setWeightInput('');
      setNoteInput('');
      queryClient.invalidateQueries({ queryKey: ['weight-records', petId] });
      queryClient.invalidateQueries({ queryKey: ['pets', petId] });
      queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => weightApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight-records', petId] }),
  });

  const records = [...(weightsQuery.data ?? [])].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const chartData = records.map((r) => ({
    date: r.local_date.slice(5),
    weight: r.weight_kg,
  }));

  function handleAdd() {
    const kg = parseFloat(weightInput);
    if (isNaN(kg) || kg <= 0) return;
    addMutation.mutate({
      pet_id: petId,
      weight_kg: kg,
      note: noteInput.trim() || undefined,
    });
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Health</p>
          <h3>Weight history</h3>
        </div>
      </div>

      {records.length >= 2 && (
        <ResponsiveContainer width="100%" height={180}>
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
      )}

      {/* Add record */}
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

      {/* Recent records */}
      {records.length > 0 && (
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
            {[...records].reverse().slice(0, 20).map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.local_date}</td>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.weight_kg} kg</td>
                <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.note ?? <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
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
      )}
    </section>
  );
}
