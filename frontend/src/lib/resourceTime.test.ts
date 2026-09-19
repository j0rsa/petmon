import { describe, expect, it } from 'vitest';
import { civilTimeCandidates, civilToInstant, instantToCivil, resourceDateTime } from './resourceTime';

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
  it('resolves the resource timezone independently of browser timezone and credit date', () => {
    expect(civilToInstant('2026-01-01T00:30', 'Asia/Tokyo')).toBe('2025-12-31T15:30:00.000Z');
    expect(instantToCivil('2025-12-31T15:30:00Z', 'Asia/Tokyo')).toBe('2026-01-01T00:30:00');
    expect(civilToInstant('2026-01-01T00:30', 'Asia/Kathmandu')).toBe('2025-12-31T18:45:00.000Z');
  });
  it('never silently normalizes nonexistent dates or DST gap times', () => {
    expect(civilTimeCandidates('2026-03-29T02:30', 'Europe/Berlin')).toEqual([]);
    expect(civilTimeCandidates('2026-02-30T12:00', 'UTC')).toEqual([]);
    expect(civilTimeCandidates('2011-12-30T12:00', 'Pacific/Apia')).toEqual([]);
    expect(() => civilToInstant('2026-03-29T02:30', 'Europe/Berlin')).toThrow('does not exist');
  });
  it('requires an explicit instant choice for repeated wall times', () => {
    const candidates = civilTimeCandidates('2026-10-25T02:30', 'Europe/Berlin');
    expect(candidates).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
    expect(() => civilToInstant('2026-10-25T02:30', 'Europe/Berlin')).toThrow('occurs twice');
    expect(civilToInstant('2026-10-25T02:30', 'Europe/Berlin', candidates[1])).toBe(candidates[1]);
    expect(civilTimeCandidates('2026-04-05T01:45', 'Australia/Lord_Howe')).toHaveLength(2);
  });
  it('rejects naive API timestamps', () => {
    expect(() => instantToCivil('2026-10-25T02:30:00', 'Europe/Berlin')).toThrow('offset timestamp');
  });
});
