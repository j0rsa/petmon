import { describe, expect, it } from 'vitest';
import { linReg } from './linReg';

describe('linReg', () => {
  it('returns null with fewer than two points', () => {
    expect(linReg([1])).toBeNull();
    expect(linReg([null, null])).toBeNull();
  });

  it('fits a straight line through two points', () => {
    expect(linReg([1, 3])).toEqual([1, 3]);
  });

  it('clamps to optional bounds', () => {
    const trend = linReg([1, 2, 3, 4, 5], { min: 1, max: 5 });
    expect(trend).not.toBeNull();
    for (const value of trend!) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
  });
});
