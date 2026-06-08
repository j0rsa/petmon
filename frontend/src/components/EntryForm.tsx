import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { Cat, CreateEntry, Entry, UpdateEntry } from '../types';

interface EntryFormProps {
  cats: Cat[];
  initialEntry?: Entry;
  initialCatId?: string;
  initialDate?: string;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit: (data: CreateEntry | UpdateEntry) => Promise<void> | void;
  submitLabel?: string;
}

function localInputFromIso(iso: string) {
  const date = new Date(iso);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function defaultInputDate(initialDate?: string) {
  if (initialDate) {
    return `${initialDate}T08:00`;
  }

  const now = new Date();
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

export function EntryForm({
  cats,
  initialEntry,
  initialCatId,
  initialDate,
  loading = false,
  onCancel,
  onSubmit,
  submitLabel = 'Save entry',
}: EntryFormProps) {
  const firstCatId = cats[0]?.id ?? '';
  const [catId, setCatId] = useState(initialEntry?.cat_id ?? initialCatId ?? firstCatId);
  const [occurredAt, setOccurredAt] = useState(initialEntry ? localInputFromIso(initialEntry.occurred_at) : defaultInputDate(initialDate));
  const [category, setCategory] = useState(initialEntry?.category ?? 'wet_food');
  const [amount, setAmount] = useState(String(initialEntry?.amount ?? ''));
  const [unit, setUnit] = useState(initialEntry?.unit ?? '');
  const [note, setNote] = useState(initialEntry?.note ?? '');
  const isEditing = useMemo(() => Boolean(initialEntry), [initialEntry]);

  useEffect(() => {
    setCatId(initialEntry?.cat_id ?? initialCatId ?? firstCatId);
    setOccurredAt(initialEntry ? localInputFromIso(initialEntry.occurred_at) : defaultInputDate(initialDate));
    setCategory(initialEntry?.category ?? 'wet_food');
    setAmount(String(initialEntry?.amount ?? ''));
    setUnit(initialEntry?.unit ?? '');
    setNote(initialEntry?.note ?? '');
  }, [firstCatId, initialCatId, initialDate, initialEntry]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isEditing && !catId) {
      return;
    }

    const parsedDate = new Date(occurredAt);
    const payloadBase = {
      occurred_at: parsedDate.toISOString(),
      local_date: occurredAt.slice(0, 10),
      category,
      amount: Number(amount),
      unit: unit || undefined,
      note: note || undefined,
    };

    if (isEditing) {
      await onSubmit(payloadBase satisfies UpdateEntry);
      return;
    }

    await onSubmit({
      cat_id: catId,
      ...payloadBase,
    } satisfies CreateEntry);
  };

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="entry-cat">Cat</label>
        <select id="entry-cat" value={catId} onChange={(event) => setCatId(event.target.value)} disabled={isEditing || cats.length === 0}>
          {cats.length === 0 && <option value="">No cats available</option>}
          {cats.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="entry-occurred-at">Occurred at</label>
        <input id="entry-occurred-at" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="entry-category">Category</label>
        <select id="entry-category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="entry-amount">Amount</label>
        <input id="entry-amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="entry-unit">Unit</label>
        <input id="entry-unit" type="text" placeholder="g, ml, tablet" value={unit} onChange={(event) => setUnit(event.target.value)} />
      </div>

      <div className="form-row form-row-full">
        <label htmlFor="entry-note">Note</label>
        <textarea id="entry-note" rows={3} placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <div className="button-row form-row-full">
        <button className="button" type="submit" disabled={loading || (!isEditing && cats.length === 0)}>
          {loading ? 'Saving…' : submitLabel}
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
