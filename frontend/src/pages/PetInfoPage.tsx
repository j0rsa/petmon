import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '../context/usePermissions';
import { Link, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { petsApi } from '../api/pets';
import { weightApi } from '../api/weight';
import { localToday, shiftDate } from '../lib/dates';
import { useSelectedPet } from '../context/SelectedPetContext';
import { PetAvatar } from '../components/pet/PetAvatar';
import { PetInfoFields } from '../components/pet/PetInfoFields';
import { PetEliminationAutoTagBuckets } from '../components/pet/PetEliminationAutoTagBuckets';
import { formStateToPayload, PetInfoForm, petToFormState } from '../components/pet/PetInfoForm';
import { getPetPhoto, readPhotoFile, removePetPhoto, setPetPhoto } from '../lib/petPhotoStorage';
import { PET_SPECIES_LABELS } from '../types';

export default function PetInfoPage() {
  const { id = '' } = useParams();
  const { setSelectedPetId } = useSelectedPet();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
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

  const weightDateFrom = shiftDate(localToday(), -29);
  const weightDateTo = localToday();

  // 30-day window for chart — read-only; full management is in /health
  const weightsQuery = useQuery({
    queryKey: ['weight-records', id, weightDateFrom],
    queryFn: () => weightApi.list({ pet_id: id, date_from: weightDateFrom, date_to: weightDateTo }),
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
          {!editing && canWrite && (
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
            petId={id}
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
          {pet.elimination_auto_categorize_by_duration && (
            <PetEliminationAutoTagBuckets petId={pet.id} />
          )}
        </section>
      )}
      <WeightChartPanel weightsQuery={weightsQuery} />
    </div>
  );
}

function WeightChartPanel({ weightsQuery }: {
  weightsQuery: ReturnType<typeof useQuery<ReturnType<typeof weightApi.list> extends Promise<infer T> ? T : never>>;
}) {
  const records = [...(weightsQuery.data ?? [])].filter((r) => r.local_date && r.weight_kg != null).sort((a, b) => a.local_date.localeCompare(b.local_date));
  const chartData = records.map((r) => ({ date: r.local_date.slice(5), weight: r.weight_kg }));
  const latest = records[records.length - 1];

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Health</p>
          <h3>Weight</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {latest && (
            <span style={{ fontFamily: 'monospace', fontSize: '1.4rem', color: 'var(--accent)' }}>
              {latest.weight_kg} kg
            </span>
          )}
          <Link className="button button-secondary button-compact" to="/health">
            Manage →
          </Link>
        </div>
      </div>

      {records.length >= 2 ? (
        <ResponsiveContainer width="100%" height={150}>
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
          {records.length === 0 ? 'No weight records yet.' : 'Add at least 2 measurements to see a chart.'}
        </p>
      )}
    </section>
  );
}
