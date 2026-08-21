import { describe, expect, it, vi } from 'vitest';
import type { MedAssignment } from '../api/medications';
import {
  DOSE_FRACTIONS,
  EMPHASIZED_DOSE_FRACTIONS,
  doseFractionLabel,
  expectedDoseCount,
  formatFrequency,
  hasActiveAssignmentOn,
  savePlanWithMedicationColor,
} from './medications';

describe('medication dose buttons', () => {
  it('orders doses from largest to smallest', () => {
    expect(DOSE_FRACTIONS).toEqual([
      'whole',
      'three_quarter',
      'half',
      'third',
      'quarter',
      'eighth',
      'sixteenth',
    ]);
  });

  it('uses uniform slash labels', () => {
    expect(DOSE_FRACTIONS.map(doseFractionLabel)).toEqual([
      '1',
      '3/4',
      '1/2',
      '1/3',
      '1/4',
      '1/8',
      '1/16',
    ]);
  });

  it('emphasizes whole, half, and quarter', () => {
    expect([...EMPHASIZED_DOSE_FRACTIONS]).toEqual(['whole', 'half', 'quarter']);
  });

  it('formats abstract time-of-day counters and cadence', () => {
    const frequency = {
      morning: 1,
      midday: 0,
      evening: 2,
      every: 3,
      unit: 'days' as const,
    };
    expect(expectedDoseCount(frequency)).toBe(3);
    expect(formatFrequency(frequency)).toBe('Morning ×1 · Evening ×2 · Every 3 days');
  });

  it('uses singular cadence units', () => {
    expect(formatFrequency({
      morning: 0,
      midday: 1,
      evening: 0,
      every: 1,
      unit: 'weeks',
    })).toBe('Midday ×1 · Every 1 week');
  });

  it('detects an active treatment plan by assignment date range', () => {
    const assignments = [
      { date_from: '2026-08-01', date_to: '2026-08-31' },
    ] as MedAssignment[];
    expect(hasActiveAssignmentOn(assignments, '2026-08-21')).toBe(true);
    expect(hasActiveAssignmentOn(assignments, '2026-09-01')).toBe(false);
  });
});

describe('treatment plan medication color saving', () => {
  it('persists a changed medication color before saving the plan', async () => {
    const calls: string[] = [];
    const saveColor = vi.fn(async () => { calls.push('color'); });
    const savePlan = vi.fn(async () => {
      calls.push('plan');
      return 'assignment';
    });

    await expect(savePlanWithMedicationColor({
      currentColor: '#f97316',
      selectedColor: '#1d4ed8',
      saveColor,
      savePlan,
    })).resolves.toBe('assignment');

    expect(calls).toEqual(['color', 'plan']);
  });

  it('keeps the color persisted when assignment validation fails', async () => {
    const saveColor = vi.fn(async () => undefined);
    const savePlan = vi.fn(async () => {
      throw new Error('invalid effective date');
    });

    await expect(savePlanWithMedicationColor({
      currentColor: '#f97316',
      selectedColor: '#1d4ed8',
      saveColor,
      savePlan,
    })).rejects.toThrow('invalid effective date');

    expect(saveColor).toHaveBeenCalledOnce();
    expect(savePlan).toHaveBeenCalledOnce();
  });

  it('does not create a plan when saving its changed color fails', async () => {
    const saveColor = vi.fn(async () => {
      throw new Error('color update failed');
    });
    const savePlan = vi.fn(async () => 'assignment');

    await expect(savePlanWithMedicationColor({
      currentColor: '#f97316',
      selectedColor: '#1d4ed8',
      saveColor,
      savePlan,
    })).rejects.toThrow('color update failed');

    expect(savePlan).not.toHaveBeenCalled();
  });

  it('skips an unchanged color update', async () => {
    const saveColor = vi.fn(async () => undefined);
    const savePlan = vi.fn(async () => 'assignment');

    await savePlanWithMedicationColor({
      currentColor: '#6366f1',
      selectedColor: '#6366f1',
      saveColor,
      savePlan,
    });

    expect(saveColor).not.toHaveBeenCalled();
    expect(savePlan).toHaveBeenCalledOnce();
  });
});
