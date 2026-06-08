import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { petsApi } from '../api/pets';
import { daysApi } from '../api/days';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { CategoryBadge } from '../components/CategoryBadge';
import { DateNavigator } from '../components/DateNavigator';
import { NutritionRecordForm } from '../components/NutritionRecordForm';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { CreateNutritionRecord, NutritionRecord, UpdateNutritionRecord } from '../types';

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeading(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function invalidateDayData(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['day-summary'] }),
    queryClient.invalidateQueries({ queryKey: ['nutrition-analytics'] }),
  ]);
}

export function DayView({ date, title }: { date: string; title: string }) {
  const queryClient = useQueryClient();
  const [selectedPetId, setSelectedPetId] = useState('');
  const [editingRecord, setEditingRecord] = useState<NutritionRecord | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [formResetKey, setFormResetKey] = useState(0);

  const petsQuery = useQuery({ queryKey: ['pets'], queryFn: petsApi.list });
  const summaryQuery = useQuery({
    queryKey: ['day-summary', date, selectedPetId],
    queryFn: () => daysApi.getSummary(date, selectedPetId || undefined),
  });

  useEffect(() => {
    setNoteDraft(summaryQuery.data?.note ?? '');
  }, [summaryQuery.data?.note]);

  useEffect(() => {
    setEditingRecord(null);
  }, [date, selectedPetId]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateNutritionRecord | UpdateNutritionRecord) => nutritionRecordsApi.create(payload as CreateNutritionRecord),
    onSuccess: async () => {
      setFormResetKey((value) => value + 1);
      await invalidateDayData(queryClient);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateNutritionRecord | UpdateNutritionRecord }) =>
      nutritionRecordsApi.update(id, payload as UpdateNutritionRecord),
    onSuccess: async () => {
      setEditingRecord(null);
      await invalidateDayData(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => nutritionRecordsApi.delete(id),
    onSuccess: async () => {
      await invalidateDayData(queryClient);
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => daysApi.updateNote(date, noteDraft, selectedPetId || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day-summary', date, selectedPetId] });
    },
  });

  const petNames = useMemo(() => new Map((petsQuery.data ?? []).map((pet) => [pet.id, pet.name])), [petsQuery.data]);
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, NutritionRecord[]>();

    for (const record of summaryQuery.data?.records ?? []) {
      const key = formatTime(record.occurred_at);
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }

    return [...groups.entries()].sort((left, right) => {
      const leftTime = left[1][0]?.occurred_at ?? '';
      const rightTime = right[1][0]?.occurred_at ?? '';
      return rightTime.localeCompare(leftTime);
    });
  }, [summaryQuery.data?.records]);

  const totalCards = CATEGORIES.map((category) => ({
    category,
    total: summaryQuery.data?.totals_by_category[category] ?? 0,
  }));

  if (petsQuery.isLoading || summaryQuery.isLoading) {
    return <div className="loading-state">Loading {title.toLowerCase()}…</div>;
  }

  if (petsQuery.isError || summaryQuery.isError) {
    const message = petsQuery.error instanceof Error ? petsQuery.error.message : summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Unable to load day summary.';
    return <div className="error-state">{message}</div>;
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{formatDateHeading(date)}</h2>
        </div>
        <div className="filter-row">
          <label htmlFor="day-pet-filter">Pet filter</label>
          <select id="day-pet-filter" value={selectedPetId} onChange={(event) => setSelectedPetId(event.target.value)}>
            <option value="">All pets</option>
            {(petsQuery.data ?? []).map((pet) => (
              <option key={pet.id} value={pet.id}>
                {pet.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <DateNavigator date={date} buildPath={(value) => `/days/${value}`} />

      <section className="summary-grid">
        {totalCards.map(({ category, total }) => (
          <article key={category} className="stat-card">
            <CategoryBadge category={category} />
            <strong>{total}</strong>
            <span>{CATEGORY_LABELS[category]}</span>
          </article>
        ))}
      </section>

      <section className="two-column-grid">
        <div className="stack-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nutrition</p>
              <h3>{summaryQuery.data?.records.length ?? 0} logged items</h3>
            </div>
          </div>

          <NutritionRecordForm
            key={formResetKey}
            pets={petsQuery.data ?? []}
            initialPetId={selectedPetId || petsQuery.data?.[0]?.id}
            initialDate={date}
            loading={createMutation.isPending}
            onSubmit={async (payload) => {
              await createMutation.mutateAsync(payload);
            }}
            submitLabel="Add record"
          />

          {groupedRecords.length === 0 ? (
            <div className="empty-state">No nutrition records logged for this day yet.</div>
          ) : (
            groupedRecords.map(([time, records]) => (
              <section key={time} className="panel">
                <div className="entry-time-heading">{time}</div>
                <div className="entry-list">
                  {records.map((record) => (
                    <div key={record.id} className="entry-card">
                      <div className="entry-card-main">
                        <div className="entry-card-header">
                          <CategoryBadge category={record.category} />
                          <strong>
                            {record.amount} {record.unit ?? ''}
                          </strong>
                          {!selectedPetId && <span className="muted-text">{petNames.get(record.pet_id) ?? 'Unknown pet'}</span>}
                        </div>
                        <div className="entry-meta">
                          <span>{record.source_type}</span>
                          {record.note && <span>• {record.note}</span>}
                        </div>
                      </div>
                      <div className="button-row">
                        <button className="button button-secondary" type="button" onClick={() => setEditingRecord(record)}>
                          Edit
                        </button>
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this record?')) {
                              deleteMutation.mutate(record.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <div className="stack-panel">
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Day note</p>
                <h3>Notes for caregivers</h3>
              </div>
            </div>
            <textarea rows={6} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add context for the day" />
            <div className="button-row">
              <button className="button" type="button" onClick={() => noteMutation.mutate()} disabled={noteMutation.isPending}>
                {noteMutation.isPending ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </section>

          {editingRecord && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Editing record</p>
                  <h3>{formatTime(editingRecord.occurred_at)}</h3>
                </div>
              </div>
              <NutritionRecordForm
                pets={petsQuery.data ?? []}
                initialRecord={editingRecord}
                loading={updateMutation.isPending}
                onCancel={() => setEditingRecord(null)}
                onSubmit={async (payload) => {
                  await updateMutation.mutateAsync({ id: editingRecord.id, payload });
                }}
                submitLabel="Update record"
              />
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

export default function DayPage() {
  const { date = '' } = useParams();

  return <DayView date={date} title="Day detail" />;
}
