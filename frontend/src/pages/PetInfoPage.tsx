import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { petsApi } from '../api/pets';
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
    </div>
  );
}
