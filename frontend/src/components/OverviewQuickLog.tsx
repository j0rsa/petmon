import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { formatLoggedNutritionMessage } from '../lib/nutritionLogMessage';
import { NutritionAddForm, type NutritionAddFormHandle } from './NutritionAddForm';
import type { CreateNutritionRecord } from '../types';

const SUCCESS_MS = 3000;

interface OverviewQuickLogProps {
  date: string;
  petId: string;
  /** Storybook: show confirmation immediately without submitting. */
  initialSuccessMessage?: string;
}

export function OverviewQuickLog({ date, petId, initialSuccessMessage }: OverviewQuickLogProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<NutritionAddFormHandle>(null);
  const [successMessage, setSuccessMessage] = useState(initialSuccessMessage ?? '');

  useEffect(() => {
    if (!successMessage) return;
    const id = window.setTimeout(() => setSuccessMessage(''), SUCCESS_MS);
    return () => window.clearTimeout(id);
  }, [successMessage]);

  const createMutation = useMutation({
    mutationFn: async (payloads: CreateNutritionRecord[]) => {
      for (const payload of payloads) {
        await nutritionRecordsApi.create(payload);
      }
      return payloads;
    },
    onSuccess: (payloads) => {
      formRef.current?.clearForm();
      setSuccessMessage(formatLoggedNutritionMessage(payloads));
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['day-summary', date, petId] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-records-day', date, petId] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['nutrition-calendar'] }),
      ]);
    },
  });

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Quick log</p>
          <h3>Log intake</h3>
        </div>
      </div>

      <NutritionAddForm
        ref={formRef}
        date={date}
        petId={petId}
        saving={createMutation.isPending}
        isPaused={createMutation.isPaused}
        onSave={(payloads) => createMutation.mutate(payloads)}
      />

      {successMessage ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: '0.65rem 0.85rem',
            borderRadius: 10,
            background: 'var(--success-bg)',
            border: '1px solid var(--success-border)',
            color: 'var(--success-text, #4ade80)',
            fontSize: '0.88rem',
            fontWeight: 500,
          }}
        >
          {successMessage}
        </p>
      ) : null}

      {createMutation.isError ? (
        <p className="muted-text" style={{ fontSize: '0.88rem', color: 'var(--error-text)' }}>
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : 'Failed to log intake.'}
        </p>
      ) : null}
    </section>
  );
}
