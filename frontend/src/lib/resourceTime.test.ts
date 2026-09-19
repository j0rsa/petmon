import { describe, expect, it } from 'vitest';
import { resourceDateTime } from './resourceTime';

describe('resource timezone civil snapshots', () => {
  it('chooses different journal dates for the same instant across the date line', () => {
    const now = new Date('2026-01-01T00:30:00Z');
    expect(resourceDateTime(now, 'America/Los_Angeles')).toBe('2025-12-31T16:30:00');
    expect(resourceDateTime(now, 'Asia/Tokyo')).toBe('2026-01-01T09:30:00');
  });
  it('respects daylight saving and represents midnight as 00 hours', () => {
    expect(resourceDateTime(new Date('2026-03-29T01:30:00Z'), 'Europe/Berlin')).toBe('2026-03-29T03:30:00');
    expect(resourceDateTime(new Date('2026-09-19T22:00:00Z'), 'Europe/Berlin')).toBe('2026-09-20T00:00:00');
  });
  it('rejects invalid configured timezones rather than guessing a journal date', () => {
    expect(() => resourceDateTime(new Date(), 'invalid/timezone')).toThrow(RangeError);
  });
});
