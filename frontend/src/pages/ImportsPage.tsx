import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import { dedupeCreateRecords, parseTelegramNutritionLog, toCreateNutritionRecords } from '../lib/parseTelegramNutritionLog';
import { CATEGORY_LABELS } from '../types';
import type { CreateNutritionRecord } from '../types';
import { usePermissions } from '../context/usePermissions';

export default function ImportsPage() {
  const queryClient = useQueryClient();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const { canWrite } = usePermissions();
  const [rawText, setRawText] = useState('');
  const [previewRecords, setPreviewRecords] = useState<CreateNutritionRecord[] | null>(null);

  const preview = useMemo(() => {
    if (!previewRecords) return null;
    const byDate = new Map<string, CreateNutritionRecord[]>();
    for (const record of previewRecords) {
      const date = record.local_date ?? record.occurred_at.slice(0, 10);
      byDate.set(date, [...(byDate.get(date) ?? []), record]);
    }
    return {
      total: previewRecords.length,
      days: [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)),
    };
  }, [previewRecords]);

  const commitMutation = useMutation({
    mutationFn: (records: CreateNutritionRecord[]) => nutritionRecordsApi.batchCreate(records),
    onSuccess: async () => {
      setPreviewRecords(null);
      setRawText('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['day-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-analytics'] }),
      ]);
    },
  });

  function handlePreview() {
    if (!selectedPetId) return;
    const parsed = parseTelegramNutritionLog(rawText);
    const records = dedupeCreateRecords(toCreateNutritionRecords(parsed, selectedPetId));
    setPreviewRecords(records);
  }

  if (petsLoading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (!selectedPetId) {
    return <NoPetSelected />;
  }

  if (!canWrite) {
    return (
      <div className="page-stack">
        <div className="empty-state">Importing records requires write access. Your API token does not have the <code>api_write</code> scope.</div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="muted-text">Importing for {selectedPet?.name ?? 'selected pet'}.</p>
        <div className="form-grid">
          <div className="form-row form-row-full">
            <label htmlFor="import-text">Telegram log</label>
            <textarea
              id="import-text"
              rows={12}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder={'Staging Bot, [31. May 2026 at 06:15:15]:\n#cat_ate #wet_food 15\n#cat_ate #liquids 16'}
            />
          </div>
          <div className="button-row form-row-full">
            <button className="button" type="button" disabled={!rawText.trim()} onClick={handlePreview}>
              Preview
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={!preview || preview.total === 0 || commitMutation.isPending}
              onClick={() => previewRecords && commitMutation.mutate(previewRecords)}
            >
              {commitMutation.isPending ? 'Importing…' : 'Import records'}
            </button>
          </div>
        </div>
        {commitMutation.isError && (
          <div className="error-state">{commitMutation.error instanceof Error ? commitMutation.error.message : 'Unable to import records.'}</div>
        )}
      </section>

      {preview && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Preview</p>
              <h3>
                {preview.total} record{preview.total === 1 ? '' : 's'} across {preview.days.length} day{preview.days.length === 1 ? '' : 's'}
              </h3>
            </div>
          </div>
          {preview.total === 0 ? (
            <div className="empty-state">No nutrition records found in the pasted log.</div>
          ) : (
            <div className="preview-list">
              {preview.days.map(([date, records]) => (
                <article key={date} className="panel">
                  <h4>{date}</h4>
                  <ul>
                    {records.map((record, index) => (
                      <li key={`${date}-${index}`}>
                        {record.occurred_at.slice(11, 16)} — {CATEGORY_LABELS[record.category] ?? record.category} — {record.amount} {record.unit ?? ''}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
