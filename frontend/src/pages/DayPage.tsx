import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { catsApi } from '../api/cats';
import { daysApi } from '../api/days';
import { entriesApi } from '../api/entries';
import { CategoryBadge } from '../components/CategoryBadge';
import { DateNavigator } from '../components/DateNavigator';
import { EntryForm } from '../components/EntryForm';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { CreateEntry, Entry, UpdateEntry } from '../types';

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
    queryClient.invalidateQueries({ queryKey: ['analytics'] }),
  ]);
}

export function DayView({ date, title }: { date: string; title: string }) {
  const queryClient = useQueryClient();
  const [selectedCatId, setSelectedCatId] = useState('');
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [formResetKey, setFormResetKey] = useState(0);

  const catsQuery = useQuery({ queryKey: ['cats'], queryFn: catsApi.list });
  const summaryQuery = useQuery({
    queryKey: ['day-summary', date, selectedCatId],
    queryFn: () => daysApi.getSummary(date, selectedCatId || undefined),
  });

  useEffect(() => {
    setNoteDraft(summaryQuery.data?.note ?? '');
  }, [summaryQuery.data?.note]);

  useEffect(() => {
    setEditingEntry(null);
  }, [date, selectedCatId]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateEntry | UpdateEntry) => entriesApi.create(payload as CreateEntry),
    onSuccess: async () => {
      setFormResetKey((value) => value + 1);
      await invalidateDayData(queryClient);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateEntry | UpdateEntry }) => entriesApi.update(id, payload as UpdateEntry),
    onSuccess: async () => {
      setEditingEntry(null);
      await invalidateDayData(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => entriesApi.delete(id),
    onSuccess: async () => {
      await invalidateDayData(queryClient);
    },
  });

  const noteMutation = useMutation({
    mutationFn: () => daysApi.updateNote(date, noteDraft, selectedCatId || undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['day-summary', date, selectedCatId] });
    },
  });

  const catNames = useMemo(() => new Map((catsQuery.data ?? []).map((cat) => [cat.id, cat.name])), [catsQuery.data]);
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, Entry[]>();

    for (const entry of summaryQuery.data?.entries ?? []) {
      const key = formatTime(entry.occurred_at);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }

    return [...groups.entries()].sort((left, right) => {
      const leftTime = left[1][0]?.occurred_at ?? '';
      const rightTime = right[1][0]?.occurred_at ?? '';
      return rightTime.localeCompare(leftTime);
    });
  }, [summaryQuery.data?.entries]);

  const totalCards = CATEGORIES.map((category) => ({
    category,
    total: summaryQuery.data?.totals_by_category[category] ?? 0,
  }));

  if (catsQuery.isLoading || summaryQuery.isLoading) {
    return <div className="loading-state">Loading {title.toLowerCase()}…</div>;
  }

  if (catsQuery.isError || summaryQuery.isError) {
    const message = catsQuery.error instanceof Error ? catsQuery.error.message : summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Unable to load day summary.';
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
          <label htmlFor="day-cat-filter">Cat filter</label>
          <select id="day-cat-filter" value={selectedCatId} onChange={(event) => setSelectedCatId(event.target.value)}>
            <option value="">All cats</option>
            {(catsQuery.data ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
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
              <p className="eyebrow">Entries</p>
              <h3>{summaryQuery.data?.entries.length ?? 0} logged items</h3>
            </div>
          </div>

          <EntryForm
            key={formResetKey}
            cats={catsQuery.data ?? []}
            initialCatId={selectedCatId || catsQuery.data?.[0]?.id}
            initialDate={date}
            loading={createMutation.isPending}
            onSubmit={async (payload) => {
              await createMutation.mutateAsync(payload);
            }}
            submitLabel="Add entry"
          />

          {groupedEntries.length === 0 ? (
            <div className="empty-state">No entries logged for this day yet.</div>
          ) : (
            groupedEntries.map(([time, entries]) => (
              <section key={time} className="panel">
                <div className="entry-time-heading">{time}</div>
                <div className="entry-list">
                  {entries.map((entry) => (
                    <div key={entry.id} className="entry-card">
                      <div className="entry-card-main">
                        <div className="entry-card-header">
                          <CategoryBadge category={entry.category} />
                          <strong>
                            {entry.amount} {entry.unit ?? ''}
                          </strong>
                          {!selectedCatId && <span className="muted-text">{catNames.get(entry.cat_id) ?? 'Unknown cat'}</span>}
                        </div>
                        <div className="entry-meta">
                          <span>{entry.source_type}</span>
                          {entry.note && <span>• {entry.note}</span>}
                        </div>
                      </div>
                      <div className="button-row">
                        <button className="button button-secondary" type="button" onClick={() => setEditingEntry(entry)}>
                          Edit
                        </button>
                        <button
                          className="button button-danger"
                          type="button"
                          onClick={() => {
                            if (window.confirm('Delete this entry?')) {
                              deleteMutation.mutate(entry.id);
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

          {editingEntry && (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Editing entry</p>
                  <h3>{formatTime(editingEntry.occurred_at)}</h3>
                </div>
              </div>
              <EntryForm
                cats={catsQuery.data ?? []}
                initialEntry={editingEntry}
                loading={updateMutation.isPending}
                onCancel={() => setEditingEntry(null)}
                onSubmit={async (payload) => {
                  await updateMutation.mutateAsync({ id: editingEntry.id, payload });
                }}
                submitLabel="Update entry"
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
