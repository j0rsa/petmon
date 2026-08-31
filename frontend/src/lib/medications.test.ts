import { describe, expect, it } from 'vitest';
import type { DailyMedAssignment, MedAssignment, MedBundle } from '../api/medications';
import {
  DOSE_FRACTIONS,
  EMPHASIZED_DOSE_FRACTIONS,
  assignmentHistoryLabel,
  assignmentStatus,
  assignmentDeleteErrorMessage,
  consecutiveCourse,
  consecutiveCourseLabel,
  bundleableAssignments,
  bundleCanTakeNow,
  bundleDailyMembers,
  defaultBundleName,
  lastBundleIntakes,
  unbundledAssignments,
  doseFractionLabel,
  expectedDoseCount,
  formatFrequency,
  groupAssignmentsByMedication,
  hasActiveAssignmentOn,
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

  it('classifies assignment status relative to a date', () => {
    const assignment = {
      date_from: '2026-08-01',
      date_to: '2026-08-31',
    } as MedAssignment;
    expect(assignmentStatus(assignment, '2026-07-31')).toBe('upcoming');
    expect(assignmentStatus(assignment, '2026-08-21')).toBe('active');
    expect(assignmentStatus(assignment, '2026-09-01')).toBe('ended');
  });
});

describe('groupAssignmentsByMedication', () => {
  const base = {
    pet_id: 'pet-1',
    formulation_id: 'form-1',
    formulation: {
      id: 'form-1',
      medication_id: 'med-1',
      tablet_strength_mg: 5,
      pill_shape: 'round' as const,
      liquid_concentration_mg_per_ml: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    dose_fraction: 'half' as const,
    liquid_dose_ml: null,
    effective_dose_mg: 2.5,
    dose_label: '½ × 5mg',
    frequency: { morning: 1, midday: 0, evening: 1, every: 1, unit: 'days' as const },
    optional: false,
    meal_wait_minutes: null,
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('keeps paused and restarted courses as one group', () => {
    const paused: MedAssignment = {
      ...base,
      id: 'old',
      medication_id: 'med-1',
      date_from: '2026-07-07',
      date_to: '2026-08-21',
      created_at: '2026-07-07T00:00:00Z',
    };
    const current: MedAssignment = {
      ...base,
      id: 'new',
      medication_id: 'med-1',
      date_from: '2026-08-22',
      date_to: null,
      created_at: '2026-08-22T00:00:00Z',
    };
    const other: MedAssignment = {
      ...base,
      id: 'other',
      medication_id: 'med-2',
      date_from: '2026-08-01',
      date_to: null,
      created_at: '2026-08-01T00:00:00Z',
    };

    const groups = groupAssignmentsByMedication([paused, other, current], '2026-08-24');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      medicationId: 'med-1',
      current: { id: 'new' },
      past: [{ id: 'old' }],
    });
    expect(groups[1]?.medicationId).toBe('med-2');
    expect(assignmentHistoryLabel(groups[0]!.past.length)).toBe('1 earlier assignment');
  });

  it('prefers an upcoming restart over an ended course', () => {
    const ended: MedAssignment = {
      ...base,
      id: 'ended',
      medication_id: 'med-1',
      date_from: '2026-07-01',
      date_to: '2026-08-21',
      created_at: '2026-07-01T00:00:00Z',
    };
    const upcoming: MedAssignment = {
      ...base,
      id: 'upcoming',
      medication_id: 'med-1',
      date_from: '2026-08-26',
      date_to: null,
      created_at: '2026-08-24T00:00:00Z',
    };

    const [group] = groupAssignmentsByMedication([ended, upcoming], '2026-08-24');
    expect(group?.current.id).toBe('upcoming');
    expect(group?.past.map((item) => item.id)).toEqual(['ended']);
  });
});

describe('consecutiveCourse', () => {
  const base = {
    pet_id: 'pet-1',
    medication_id: 'med-1',
    formulation_id: 'form-1',
    formulation: {
      id: 'form-1',
      medication_id: 'med-1',
      tablet_strength_mg: 5,
      pill_shape: 'round' as const,
      liquid_concentration_mg_per_ml: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    dose_fraction: 'half' as const,
    liquid_dose_ml: null,
    effective_dose_mg: 2.5,
    dose_label: '½ × 5mg',
    frequency: { morning: 1, midday: 0, evening: 1, every: 1, unit: 'days' as const },
    optional: false,
    meal_wait_minutes: null,
    updated_at: '2026-01-01T00:00:00Z',
  };

  function assignment(
    id: string,
    dateFrom: string,
    dateTo: string | null,
    createdAt = `${dateFrom}T00:00:00Z`,
  ): MedAssignment {
    return { ...base, id, date_from: dateFrom, date_to: dateTo, created_at: createdAt };
  }

  it('counts from the first assignment when 1 2 3 4 have no pause', () => {
    const one = assignment('1', '2026-08-01', '2026-08-04');
    const two = assignment('2', '2026-08-05', '2026-08-10');
    const three = assignment('3', '2026-08-11', '2026-08-20');
    const four = assignment('4', '2026-08-21', null);
    expect(consecutiveCourse(four, [one, two, three], '2026-08-24')).toEqual({
      from: '2026-08-01',
      to: '2026-08-24',
      days: 24,
      ongoing: true,
    });
  });

  it('restarts after a pause in 1 2 _ 3 4', () => {
    const one = assignment('1', '2026-08-01', '2026-08-04');
    const two = assignment('2', '2026-08-05', '2026-08-10');
    const three = assignment('3', '2026-08-13', '2026-08-20');
    const four = assignment('4', '2026-08-21', null);
    expect(consecutiveCourse(four, [one, two, three], '2026-08-24')).toEqual({
      from: '2026-08-13',
      to: '2026-08-24',
      days: 12,
      ongoing: true,
    });
  });

  it('uses the ended assignment date_to instead of today', () => {
    const one = assignment('1', '2026-08-01', '2026-08-10');
    const four = assignment('4', '2026-08-11', '2026-08-20');
    expect(consecutiveCourse(four, [one], '2026-08-24')).toEqual({
      from: '2026-08-01',
      to: '2026-08-20',
      days: 20,
      ongoing: false,
    });
  });

  it('treats a next-day restart as consecutive', () => {
    const paused = assignment('old', '2026-07-07', '2026-08-21');
    const current = assignment('new', '2026-08-22', null);
    expect(consecutiveCourse(current, [paused], '2026-08-24')).toEqual({
      from: '2026-07-07',
      to: '2026-08-24',
      days: 49,
      ongoing: true,
    });
  });

  it('hides the count for an assignment that has not started', () => {
    const upcoming = assignment('upcoming', '2026-08-26', null);
    const ended = assignment('ended', '2026-07-01', '2026-08-21');
    expect(consecutiveCourse(upcoming, [ended], '2026-08-24')).toBeNull();
  });

  it('formats ongoing and ended labels', () => {
    const formatDate = (date: string) => date;
    expect(consecutiveCourseLabel(
      { from: '2026-08-01', to: '2026-08-24', days: 24, ongoing: true },
      formatDate,
    )).toBe('24 days · since 2026-08-01');
    expect(consecutiveCourseLabel(
      { from: '2026-08-01', to: '2026-08-20', days: 20, ongoing: false },
      formatDate,
    )).toBe('20 days · 2026-08-01 → 2026-08-20');
    expect(consecutiveCourseLabel(
      { from: '2026-08-24', to: '2026-08-24', days: 1, ongoing: true },
      formatDate,
    )).toBe('1 day · since 2026-08-24');
  });
});

describe('assignment delete errors', () => {
  it('explains when logged doses block deletion', async () => {
    const { ApiError } = await import('../api/client');
    expect(assignmentDeleteErrorMessage(new ApiError(400, { message: 'cannot delete' }))).toBe(
      'This assignment has logged doses, so it can’t be deleted. Pause it to stop the schedule, or undo those doses first.',
    );
  });

  it('falls back for unexpected failures', () => {
    expect(assignmentDeleteErrorMessage(new Error('network'))).toBe('Assignment could not be deleted.');
  });
});

describe('medication bundles', () => {
  const scheduled = {
    pet_id: 'pet-1',
    formulation_id: 'form-1',
    formulation: {
      id: 'form-1',
      medication_id: 'med-1',
      tablet_strength_mg: 5,
      pill_shape: 'round' as const,
      liquid_concentration_mg_per_ml: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    dose_fraction: 'half' as const,
    liquid_dose_ml: null,
    effective_dose_mg: 2.5,
    dose_label: '½ × 5mg',
    frequency: { morning: 1, midday: 0, evening: 0, every: 1, unit: 'days' as const },
    optional: false,
    meal_wait_minutes: null,
    date_from: '2026-08-01',
    date_to: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };

  it('offers current scheduled assignments and skips optional or ended ones', () => {
    const assignments: MedAssignment[] = [
      { ...scheduled, id: 'a', medication_id: 'med-1' },
      { ...scheduled, id: 'b', medication_id: 'med-2', optional: true },
      { ...scheduled, id: 'c', medication_id: 'med-3', date_to: '2026-08-20' },
      { ...scheduled, id: 'd', medication_id: 'med-4' },
    ];
    expect(bundleableAssignments(assignments, '2026-08-24').map((item) => item.id)).toEqual(['a', 'd']);
  });

  it('hides medications that already belong to a bundle', () => {
    const assignments: MedAssignment[] = [
      { ...scheduled, id: 'a', medication_id: 'med-1' },
      { ...scheduled, id: 'd', medication_id: 'med-4' },
      { ...scheduled, id: 'e', medication_id: 'med-5' },
    ];
    const bundle: MedBundle = {
      id: 'bundle-1',
      pet_id: 'pet-1',
      name: 'Pair',
      items: [
        {
          medication_id: 'med-1',
          medication: {
            id: 'med-1',
            pet_id: 'pet-1',
            name: 'A',
            med_type: 'pill',
            color: '#6366f1',
            emoji: null,
            description: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
        {
          medication_id: 'med-4',
          medication: {
            id: 'med-4',
            pet_id: 'pet-1',
            name: 'D',
            med_type: 'pill',
            color: '#22c55e',
            emoji: null,
            description: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    expect(unbundledAssignments(assignments, [bundle], '2026-08-24').map((item) => item.id)).toEqual(['e']);
    expect(unbundledAssignments(assignments, [], '2026-08-24').map((item) => item.id)).toEqual(['a', 'd', 'e']);
  });

  it('requires every member to be due today before take now', () => {
    const medication = {
      id: 'med-1',
      pet_id: 'pet-1',
      name: 'Pred',
      med_type: 'pill' as const,
      color: '#6366f1',
      emoji: '💊',
      description: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const other = { ...medication, id: 'med-2', name: 'Gaba' };
    const third = { ...medication, id: 'med-3', name: 'Ome' };
    const assignment: MedAssignment = { ...scheduled, id: 'a', medication_id: 'med-1' };
    const otherAssignment: MedAssignment = { ...scheduled, id: 'b', medication_id: 'med-2' };
    const thirdAssignment: MedAssignment = { ...scheduled, id: 'c', medication_id: 'med-3' };
    const bundle: MedBundle = {
      id: 'bundle-1',
      pet_id: 'pet-1',
      name: 'Pred + Gaba',
      items: [
        { medication_id: 'med-1', medication },
        { medication_id: 'med-2', medication: other },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const triple: MedBundle = {
      ...bundle,
      id: 'bundle-3',
      name: 'Pred + Gaba + Ome',
      items: [
        ...bundle.items,
        { medication_id: 'med-3', medication: third },
      ],
    };
    const daily: DailyMedAssignment[] = [
      { medication, assignment, intakes: [] },
      { medication: other, assignment: otherAssignment, intakes: [] },
      { medication: third, assignment: thirdAssignment, intakes: [] },
    ];
    const members = bundleDailyMembers(bundle, daily);
    expect(members).toHaveLength(2);
    expect(bundleDailyMembers(triple, daily)).toHaveLength(3);
    expect(bundleCanTakeNow(members!)).toBe(true);
    expect(bundleCanTakeNow([
      { ...daily[0]!, intakes: [{ taken: true } as DailyMedAssignment['intakes'][number]] },
      daily[1]!,
    ])).toBe(false);
    expect(bundleDailyMembers(bundle, [daily[0]!])).toBeNull();
    expect(defaultBundleName(['Pred', 'Gaba', 'Ome'])).toBe('Pred + Gaba + Ome');
  });

  it('undoes the latest shared bundle take', () => {
    const intake = (id: string, occurredAt: string): DailyMedAssignment['intakes'][number] => ({
      id,
      pet_id: 'pet-1',
      medication_id: 'med-1',
      assignment_id: 'a',
      assignment: scheduled as MedAssignment,
      dose_fraction_override: null,
      liquid_dose_ml_override: null,
      effective_dose_fraction: null,
      effective_dose_mg: null,
      dose_label: '½ × 5mg',
      occurred_at: occurredAt,
      local_date: occurredAt.slice(0, 10),
      taken: true,
      note: null,
      source_type: 'manual',
      created_at: occurredAt,
    });
    const members: DailyMedAssignment[] = [
      {
        medication: {
          id: 'med-1',
          pet_id: 'pet-1',
          name: 'Pred',
          med_type: 'pill',
          color: '#6366f1',
          emoji: '💊',
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        assignment: { ...scheduled, id: 'a', medication_id: 'med-1' },
        intakes: [
          intake('old-a', '2026-08-23T08:00:00'),
          intake('new-a', '2026-08-24T09:00:00'),
        ],
      },
      {
        medication: {
          id: 'med-2',
          pet_id: 'pet-1',
          name: 'Gaba',
          med_type: 'pill',
          color: '#22c55e',
          emoji: '🌙',
          description: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        assignment: { ...scheduled, id: 'b', medication_id: 'med-2' },
        intakes: [
          intake('old-b', '2026-08-23T08:00:00'),
          intake('new-b', '2026-08-24T09:00:00'),
        ],
      },
    ];
    expect(lastBundleIntakes(members).map((item) => item.id)).toEqual(['new-a', 'new-b']);
    expect(lastBundleIntakes([{ ...members[0]!, intakes: [] }, { ...members[1]!, intakes: [] }])).toEqual([]);
  });
});
