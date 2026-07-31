import { describe, expect, it } from 'vitest';
import { shiftDate } from './dates';

describe('shiftDate', () => {
  it('moves forward and backward by whole local calendar days', () => {
    expect(shiftDate('2024-06-15', 1)).toBe('2024-06-16');
    expect(shiftDate('2024-06-15', -1)).toBe('2024-06-14');
    expect(shiftDate('2024-06-15', 0)).toBe('2024-06-15');
  });

  it('crosses month and year boundaries', () => {
    expect(shiftDate('2024-01-31', 1)).toBe('2024-02-01');
    expect(shiftDate('2024-01-01', -1)).toBe('2023-12-31');
  });

  // Regression: old implementation used toISOString(), which in UTC+2 turned
  // “31 Jul − 1 day” into 29 Jul and “31 Jul + 1 day” into 31 Jul (no move).
  it('shifts end-of-month dates by exactly one local calendar day', () => {
    expect(shiftDate('2026-07-31', -1)).toBe('2026-07-30');
    expect(shiftDate('2026-07-31', 1)).toBe('2026-08-01');
  });
});
