import { describe, it, expect } from 'vitest';
import {
  HEALTH_STATE_OPTIONS,
  HEALTH_STATE_LEVELS,
  compareHealthStateLevels,
  healthStateEmoji,
  healthStateLabel,
} from './healthState';

describe('HEALTH_STATE_OPTIONS', () => {
  it('defines five unique levels in left-to-right order', () => {
    expect(HEALTH_STATE_OPTIONS).toHaveLength(5);
    const levels = HEALTH_STATE_OPTIONS.map((option) => option.level);
    expect(new Set(levels).size).toBe(5);
    expect(levels).toEqual(['terrible', 'poor', 'ok', 'good', 'amazing']);
  });
});

describe('healthStateLabel', () => {
  it('returns casual user-facing labels', () => {
    expect(healthStateLabel('ok')).toBe('OK');
    expect(healthStateLabel('amazing')).toBe('Amazing');
    expect(healthStateLabel('terrible')).toBe('Terrible');
  });
});

describe('healthStateEmoji', () => {
  it('returns an emoji for each level', () => {
    for (const level of HEALTH_STATE_LEVELS) {
      expect(healthStateEmoji(level)).toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

describe('compareHealthStateLevels', () => {
  it('orders levels from terrible to amazing', () => {
    expect(compareHealthStateLevels('terrible', 'amazing')).toBeLessThan(0);
    expect(compareHealthStateLevels('ok', 'ok')).toBe(0);
    expect(compareHealthStateLevels('good', 'poor')).toBeGreaterThan(0);
  });
});
