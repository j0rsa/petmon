import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { TimeInput } from './TimeInput';
import { nowTimeString, isoFromDateAndTime } from '../lib/time';
import { parseAmountExpression, parseWetFoodLiquidPair } from '../lib/numbers';
import { CATEGORIES, CATEGORY_LABELS } from '../types';
import type { CreateNutritionRecord } from '../types';

const UNIT_FOR_CATEGORY: Record<string, string> = {
  wet_food: 'g',
  dry_food: 'g',
  water: 'ml',
  liquids: 'ml',
};

/** UI-only entry mode: creates one wet_food + one liquids record. Not a backend category. */
export const ENTRY_WET_FOOD_PLUS_LIQUID = 'wet_food_plus_liquid';

function unitFor(category: string) {
  if (category === ENTRY_WET_FOOD_PLUS_LIQUID) return 'g, ml';
  return UNIT_FOR_CATEGORY[category] ?? '';
}

export interface NutritionAddFormHandle {
  clearForm: () => void;
}

interface NutritionAddFormProps {
  date: string;
  petId: string;
  onSave: (payloads: CreateNutritionRecord[]) => void;
  saving: boolean;
  isPaused: boolean;
}

export const NutritionAddForm = forwardRef<NutritionAddFormHandle, NutritionAddFormProps>(
  function NutritionAddForm({ date, petId, onSave, saving, isPaused }, ref) {
    const [time, setTime] = useState(nowTimeString);
    const [category, setCategory] = useState<string>(ENTRY_WET_FOOD_PLUS_LIQUID);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const amountRef = useRef<HTMLInputElement>(null);
    const isCombined = category === ENTRY_WET_FOOD_PLUS_LIQUID;

    useImperativeHandle(ref, () => ({
      clearForm() {
        setAmount('');
        setNote('');
        amountRef.current?.focus();
      },
    }));

    function handleAdd() {
      const occurredAt = isoFromDateAndTime(date, time);
      const noteValue = note.trim() || null;

      if (isCombined) {
        const pair = parseWetFoodLiquidPair(amount);
        if (!pair) return;
        const payloads: CreateNutritionRecord[] = [];
        if (pair.wetFood > 0) {
          payloads.push({
            pet_id: petId,
            occurred_at: occurredAt,
            local_date: date,
            category: 'wet_food',
            amount: pair.wetFood,
            unit: unitFor('wet_food'),
            note: noteValue,
          });
        }
        if (pair.liquids > 0) {
          payloads.push({
            pet_id: petId,
            occurred_at: occurredAt,
            local_date: date,
            category: 'liquids',
            amount: pair.liquids,
            unit: unitFor('liquids'),
            note: noteValue,
          });
        }
        if (payloads.length === 0) return;
        onSave(payloads);
        // Form clears via ref.clearForm() called from createMutation.onSuccess,
        // so values are preserved while the mutation is paused offline.
        return;
      }

      const n = parseAmountExpression(amount);
      if (!amount.trim() || isNaN(n) || n <= 0) return;
      onSave([{
        pet_id: petId,
        occurred_at: occurredAt,
        local_date: date,
        category,
        amount: n,
        unit: unitFor(category),
        note: noteValue,
      }]);
      // Form clears via ref.clearForm() called from createMutation.onSuccess,
      // so values are preserved while the mutation is paused offline.
    }

    return (
      <div className="record-entry-form record-entry-form--nutrition">
        <div className="form-row">
          <label>Time</label>
          <TimeInput value={time} onChange={setTime} variant="form" />
        </div>
        <div className="form-row">
          <label>Category</label>
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value={ENTRY_WET_FOOD_PLUS_LIQUID}>Wet food + Liquid</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Amount</label>
          <div className="record-entry-amount-wrap">
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              aria-label="Amount"
              placeholder={isCombined ? '123,456' : '130 or 450 - 320'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <span className="entry-unit-hint">{unitFor(category)}</span>
          </div>
        </div>
        <div className="form-row">
          <label>Note</label>
          <input
            type="text"
            aria-label="Note"
            placeholder="note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
        </div>
        <button
          className="button"
          type="button"
          disabled={saving || !amount}
          onClick={handleAdd}
        >
          {isPaused ? 'Offline…' : saving ? 'Saving…' : 'Log intake'}
        </button>
      </div>
    );
  },
);
