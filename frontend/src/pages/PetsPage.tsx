import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { petsApi } from '../api/pets';
import { PetAvatar } from '../components/pet/PetAvatar';
import { getPetPhoto } from '../lib/petPhotoStorage';
import { PET_SPECIES, PET_SPECIES_LABELS, PET_STATUSES, PET_STATUS_LABELS, type PetSpecies, type PetStatus } from '../types';
import { usePermissions } from '../context/usePermissions';

interface PetFormState {
  name: string;
  species: PetSpecies;
  status: PetStatus;
  feeding_notes: string;
}

const emptyForm: PetFormState = {
  name: '',
  species: 'cat',
  status: 'active',
  feeding_notes: '',
};

function toPayload(form: PetFormState) {
  return {
    name: form.name,
    species: form.species,
    status: form.status,
    feeding_notes: form.feeding_notes || undefined,
  };
}

export default function PetsPage() {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const [createForm, setCreateForm] = useState<PetFormState>(emptyForm);
  const [editingPetId, setEditingPetId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<PetFormState>(emptyForm);

  const petsQuery = useQuery({ queryKey: ['pets'], queryFn: petsApi.list });
  const sortedPets = useMemo(() => [...(petsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [petsQuery.data]);

  const createMutation = useMutation({
    mutationFn: () => petsApi.create(toPayload(createForm)),
    onSuccess: async () => {
      setCreateForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: PetFormState }) => petsApi.update(id, toPayload(form)),
    onSuccess: async () => {
      setEditingPetId(null);
      await queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => petsApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pets'] });
    },
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Pets</p>
          <h2>Manage pet profiles</h2>
          <p className="muted-text">Keep weights, statuses, and feeding notes current.</p>
        </div>
      </section>

      {canWrite && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Add pet</p>
              <h3>Create a new profile</h3>
            </div>
          </div>
          <PetForm form={createForm} setForm={setCreateForm} onSubmit={() => createMutation.mutate()} submitLabel={createMutation.isPending ? 'Saving…' : 'Add a pet'} />
        </section>
      )}

      {petsQuery.isLoading ? (
        <div className="loading-state">Loading pets…</div>
      ) : petsQuery.isError ? (
        <div className="error-state">{petsQuery.error instanceof Error ? petsQuery.error.message : 'Unable to load pets.'}</div>
      ) : sortedPets.length === 0 ? (
        <div className="empty-state">No pets yet. Add the first one above.</div>
      ) : (
        <div className="card-grid">
          {sortedPets.map((pet) => (
            <article key={pet.id} className="panel">
              {editingPetId === pet.id ? (
                <>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Editing pet</p>
                      <h3>{pet.name}</h3>
                    </div>
                  </div>
                  <PetForm
                    form={editingForm}
                    setForm={setEditingForm}
                    onSubmit={() => updateMutation.mutate({ id: pet.id, form: editingForm })}
                    submitLabel={updateMutation.isPending ? 'Saving…' : 'Update pet'}
                    onCancel={() => setEditingPetId(null)}
                  />
                </>
              ) : (
                <>
                  <div className="pet-list-card-header">
                    <PetAvatar species={pet.species} name={pet.name} color={pet.color} photoUrl={getPetPhoto(pet.id)} size={72} />
                    <div>
                      <div className="entry-card-header">
                        <h3>{pet.name}</h3>
                        <div className="button-row">
                          <span className="status-pill">{PET_SPECIES_LABELS[pet.species]}</span>
                          <span className="status-pill">{PET_STATUS_LABELS[pet.status]}</span>
                        </div>
                      </div>
                      <p className="muted-text">{pet.breed || 'Breed not set'}</p>
                    </div>
                  </div>
                  <p>{pet.feeding_notes || 'No feeding notes yet.'}</p>
                  <div className="button-row">
                    <Link className="button" to={`/pets/${pet.id}`}>
                      Profile
                    </Link>
                    {canWrite && (
                      <>
                        <button
                          className="button button-secondary"
                          type="button"
                          onClick={() => {
                            setEditingPetId(pet.id);
                            setEditingForm({
                              name: pet.name,
                              species: pet.species,
                              status: pet.status,
                              feeding_notes: pet.feeding_notes ?? '',
                            });
                          }}
                        >
                          Quick edit
                        </button>
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete ${pet.name}?`)) {
                              deleteMutation.mutate(pet.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function PetForm({
  form,
  setForm,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  form: PetFormState;
  setForm: React.Dispatch<React.SetStateAction<PetFormState>>;
  onSubmit: () => void;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-row">
        <label htmlFor="pet-name">Name</label>
        <input id="pet-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
      </div>
      <div className="form-row">
        <label htmlFor="pet-species">Species</label>
        <select id="pet-species" value={form.species} onChange={(event) => setForm((current) => ({ ...current, species: event.target.value as PetSpecies }))}>
          {PET_SPECIES.map((species) => (
            <option key={species} value={species}>
              {PET_SPECIES_LABELS[species]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label htmlFor="pet-status">Status</label>
        <select id="pet-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PetStatus }))}>
          {PET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PET_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-row form-row-full">
        <label htmlFor="pet-notes">Feeding notes</label>
        <textarea id="pet-notes" rows={4} value={form.feeding_notes} onChange={(event) => setForm((current) => ({ ...current, feeding_notes: event.target.value }))} />
      </div>
      <div className="button-row form-row-full">
        <button className="button" type="submit">
          {submitLabel}
        </button>
        {onCancel && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
