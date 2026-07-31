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
});
