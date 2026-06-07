import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { catsApi } from '../api/cats';

interface CatFormState {
  name: string;
  status: string;
  weight_kg: string;
  feeding_notes: string;
}

const emptyForm: CatFormState = {
  name: '',
  status: 'active',
  weight_kg: '',
  feeding_notes: '',
};

function toPayload(form: CatFormState) {
  return {
    name: form.name,
    status: form.status,
    weight_kg: form.weight_kg ? Number(form.weight_kg) : undefined,
    feeding_notes: form.feeding_notes || undefined,
  };
}

export default function CatsPage() {
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState<CatFormState>(emptyForm);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<CatFormState>(emptyForm);

  const catsQuery = useQuery({ queryKey: ['cats'], queryFn: catsApi.list });
  const sortedCats = useMemo(() => [...(catsQuery.data ?? [])].sort((left, right) => left.name.localeCompare(right.name)), [catsQuery.data]);

  const createMutation = useMutation({
    mutationFn: () => catsApi.create(toPayload(createForm)),
    onSuccess: async () => {
      setCreateForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ['cats'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: CatFormState }) => catsApi.update(id, toPayload(form)),
    onSuccess: async () => {
      setEditingCatId(null);
      await queryClient.invalidateQueries({ queryKey: ['cats'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => catsApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cats'] });
    },
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Cats</p>
          <h2>Manage cat profiles</h2>
          <p className="muted-text">Keep weights, statuses, and feeding notes current.</p>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Add cat</p>
            <h3>Create a new profile</h3>
          </div>
        </div>
        <CatForm form={createForm} setForm={setCreateForm} onSubmit={() => createMutation.mutate()} submitLabel={createMutation.isPending ? 'Saving…' : 'Create cat'} />
      </section>

      {catsQuery.isLoading ? (
        <div className="loading-state">Loading cats…</div>
      ) : catsQuery.isError ? (
        <div className="error-state">{catsQuery.error instanceof Error ? catsQuery.error.message : 'Unable to load cats.'}</div>
      ) : sortedCats.length === 0 ? (
        <div className="empty-state">No cats yet. Add the first cat above.</div>
      ) : (
        <div className="card-grid">
          {sortedCats.map((cat) => (
            <article key={cat.id} className="panel">
              {editingCatId === cat.id ? (
                <>
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Editing cat</p>
                      <h3>{cat.name}</h3>
                    </div>
                  </div>
                  <CatForm
                    form={editingForm}
                    setForm={setEditingForm}
                    onSubmit={() => updateMutation.mutate({ id: cat.id, form: editingForm })}
                    submitLabel={updateMutation.isPending ? 'Saving…' : 'Update cat'}
                    onCancel={() => setEditingCatId(null)}
                  />
                </>
              ) : (
                <>
                  <div className="entry-card-header">
                    <h3>{cat.name}</h3>
                    <span className="status-pill">{cat.status}</span>
                  </div>
                  <p className="muted-text">Weight: {cat.weight_kg ?? '—'} kg</p>
                  <p>{cat.feeding_notes || 'No feeding notes yet.'}</p>
                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setEditingCatId(cat.id);
                        setEditingForm({
                          name: cat.name,
                          status: cat.status,
                          weight_kg: cat.weight_kg ? String(cat.weight_kg) : '',
                          feeding_notes: cat.feeding_notes ?? '',
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete ${cat.name}?`)) {
                          deleteMutation.mutate(cat.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
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

function CatForm({
  form,
  setForm,
  onSubmit,
  submitLabel,
  onCancel,
}: {
  form: CatFormState;
  setForm: React.Dispatch<React.SetStateAction<CatFormState>>;
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
        <label htmlFor="cat-name">Name</label>
        <input id="cat-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
      </div>
      <div className="form-row">
        <label htmlFor="cat-status">Status</label>
        <input id="cat-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} required />
      </div>
      <div className="form-row">
        <label htmlFor="cat-weight">Weight (kg)</label>
        <input id="cat-weight" type="number" min="0" step="0.01" value={form.weight_kg} onChange={(event) => setForm((current) => ({ ...current, weight_kg: event.target.value }))} />
      </div>
      <div className="form-row form-row-full">
        <label htmlFor="cat-notes">Feeding notes</label>
        <textarea id="cat-notes" rows={4} value={form.feeding_notes} onChange={(event) => setForm((current) => ({ ...current, feeding_notes: event.target.value }))} />
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
