import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { Pet, CreateNutritionRecord, NutritionRecord, UpdateNutritionRecord } from '../types';

interface NutritionRecordFormProps {
  pets: Pet[];
  initialRecord?: NutritionRecord;
  initialPetId?: string;
  initialDate?: string;
  loading?: boolean;
  onCancel?: () => void;
  onSubmit: (data: CreateNutritionRecord | UpdateNutritionRecord) => Promise<void> | void;
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

export function NutritionRecordForm({
  pets,
  initialRecord,
  initialPetId,
  initialDate,
  loading = false,
  onCancel,
  onSubmit,
  submitLabel = 'Save record',
}: NutritionRecordFormProps) {
  const firstPetId = pets[0]?.id ?? '';
  const [petId, setPetId] = useState(initialRecord?.pet_id ?? initialPetId ?? firstPetId);
  const [occurredAt, setOccurredAt] = useState(initialRecord ? localInputFromIso(initialRecord.occurred_at) : defaultInputDate(initialDate));
  const [category, setCategory] = useState(initialRecord?.category ?? 'wet_food');
  const [amount, setAmount] = useState(String(initialRecord?.amount ?? ''));
  const [unit, setUnit] = useState(initialRecord?.unit ?? '');
  const [note, setNote] = useState(initialRecord?.note ?? '');
  const isEditing = useMemo(() => Boolean(initialRecord), [initialRecord]);

  useEffect(() => {
    setPetId(initialRecord?.pet_id ?? initialPetId ?? firstPetId);
    setOccurredAt(initialRecord ? localInputFromIso(initialRecord.occurred_at) : defaultInputDate(initialDate));
    setCategory(initialRecord?.category ?? 'wet_food');
    setAmount(String(initialRecord?.amount ?? ''));
    setUnit(initialRecord?.unit ?? '');
    setNote(initialRecord?.note ?? '');
  }, [firstPetId, initialPetId, initialDate, initialRecord]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isEditing && !petId) {
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
      await onSubmit(payloadBase satisfies UpdateNutritionRecord);
      return;
    }

    await onSubmit({
      pet_id: petId,
      ...payloadBase,
    } satisfies CreateNutritionRecord);
  };

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div className="form-row">
        <label htmlFor="nutrition-record-pet">Pet</label>
        <select id="nutrition-record-pet" value={petId} onChange={(event) => setPetId(event.target.value)} disabled={isEditing || pets.length === 0}>
          {pets.length === 0 && <option value="">No pets available</option>}
          {pets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="nutrition-record-occurred-at">Occurred at</label>
        <input id="nutrition-record-occurred-at" type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="nutrition-record-category">Category</label>
        <select id="nutrition-record-category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label htmlFor="nutrition-record-amount">Amount</label>
        <input id="nutrition-record-amount" type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </div>

      <div className="form-row">
        <label htmlFor="nutrition-record-unit">Unit</label>
        <input id="nutrition-record-unit" type="text" placeholder="g, ml, tablet" value={unit} onChange={(event) => setUnit(event.target.value)} />
      </div>

      <div className="form-row form-row-full">
        <label htmlFor="nutrition-record-note">Note</label>
        <textarea id="nutrition-record-note" rows={3} placeholder="Optional note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      <div className="button-row form-row-full">
        <button className="button" type="submit" disabled={loading || (!isEditing && pets.length === 0)}>
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
