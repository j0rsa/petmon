import { describe, it, expect } from 'vitest';
import type { HealthStateRecord } from '../api/healthState';
import {
  buildHealthStateSummary,
  healthStateScore,
  median,
  weekStart,
} from './healthStateChart';

const baseRecord = (overrides: Partial<HealthStateRecord>): HealthStateRecord => ({
  id: 'hs-test',
  pet_id: '550e8400-e29b-41d4-a716-446655440000',
  occurred_at: '2024-06-15T10:00:00',
  local_date: '2024-06-15',
  level: 'ok',
  note: null,
  source_type: 'manual',
  created_at: '2024-06-15T10:00:00',
  ...overrides,
});

describe('healthStateScore', () => {
  it('maps levels to 1–5', () => {
    expect(healthStateScore('terrible')).toBe(1);
    expect(healthStateScore('ok')).toBe(3);
    expect(healthStateScore('amazing')).toBe(5);
  });
});

describe('median', () => {
  it('returns the middle value for odd counts', () => {
    expect(median([1, 5, 3])).toBe(3);
  });

  it('returns the average of two middle values for even counts', () => {
    expect(median([1, 5, 3, 4])).toBe(3.5);
  });
});

describe('buildHealthStateSummary', () => {
  it('aggregates multiple entries on the same day to a median score', () => {
    const records = [
      baseRecord({ id: '1', level: 'terrible', occurred_at: '2024-06-15T09:00:00' }),
      baseRecord({ id: '2', level: 'amazing', occurred_at: '2024-06-15T18:00:00' }),
    ];

    const buckets = buildHealthStateSummary(records, 'daily');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket).toBe('2024-06-15');
    expect(buckets[0].medianScore).toBe(3);
    expect(buckets[0].medianLevel).toBe('ok');
    expect(buckets[0].count).toBe(2);
    expect(buckets[0].minScore).toBe(1);
    expect(buckets[0].maxScore).toBe(5);
  });

  it('groups by week for weekly granularity', () => {
    const records = [
      baseRecord({ id: '1', local_date: '2024-06-10', level: 'good' }),
      baseRecord({ id: '2', local_date: '2024-06-12', level: 'poor' }),
    ];

    const buckets = buildHealthStateSummary(records, 'weekly');
    expect(buckets).toHaveLength(1);
    expect(buckets[0].bucket).toBe(weekStart('2024-06-10'));
    expect(buckets[0].medianScore).toBe(3);
    expect(buckets[0].medianLevel).toBe('ok');
  });
});
