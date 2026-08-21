import { describe, expect, it, vi } from 'vitest';
import type { MedAssignment } from '../api/medications';
import {
  DOSE_FRACTIONS,
  EMPHASIZED_DOSE_FRACTIONS,
  doseFractionLabel,
  expectedDoseCount,
  formatFrequency,
  hasActiveAssignmentOn,
  savePlanWithMedicationPresentation,
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

describe('treatment plan medication presentation saving', () => {
  it('persists changed medication color and emoji before saving the plan', async () => {
    const calls: string[] = [];
    const savePresentation = vi.fn(async () => { calls.push('presentation'); });
    const savePlan = vi.fn(async () => {
      calls.push('plan');
      return 'assignment';
    });

    await expect(savePlanWithMedicationPresentation({
      currentColor: '#f97316',
      selectedColor: '#f97316',
      currentEmoji: null,
      selectedEmoji: '💧',
      savePresentation,
      savePlan,
    })).resolves.toBe('assignment');

    expect(calls).toEqual(['presentation', 'plan']);
  });

  it('keeps the presentation persisted when assignment validation fails', async () => {
    const savePresentation = vi.fn(async () => undefined);
    const savePlan = vi.fn(async () => {
      throw new Error('invalid effective date');
    });

    await expect(savePlanWithMedicationPresentation({
      currentColor: '#f97316',
      selectedColor: '#1d4ed8',
      currentEmoji: null,
      selectedEmoji: '🦠',
      savePresentation,
      savePlan,
    })).rejects.toThrow('invalid effective date');

    expect(savePresentation).toHaveBeenCalledOnce();
    expect(savePlan).toHaveBeenCalledOnce();
  });

  it('does not create a plan when saving its changed presentation fails', async () => {
    const savePresentation = vi.fn(async () => {
      throw new Error('presentation update failed');
    });
    const savePlan = vi.fn(async () => 'assignment');

    await expect(savePlanWithMedicationPresentation({
      currentColor: '#f97316',
      selectedColor: '#1d4ed8',
      currentEmoji: null,
      selectedEmoji: '🦠',
      savePresentation,
      savePlan,
    })).rejects.toThrow('presentation update failed');

    expect(savePlan).not.toHaveBeenCalled();
  });

  it('skips an unchanged presentation update', async () => {
    const savePresentation = vi.fn(async () => undefined);
    const savePlan = vi.fn(async () => 'assignment');

    await savePlanWithMedicationPresentation({
      currentColor: '#6366f1',
      selectedColor: '#6366f1',
      currentEmoji: null,
      selectedEmoji: '',
      savePresentation,
      savePlan,
    });

    expect(savePresentation).not.toHaveBeenCalled();
    expect(savePlan).toHaveBeenCalledOnce();
  });
});
