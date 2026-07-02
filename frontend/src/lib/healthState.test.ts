import { describe, it, expect } from 'vitest';
import {
  HEALTH_STATE_OPTIONS,
  HEALTH_STATE_LEVELS,
  compareHealthStateLevels,
  healthStateEmoji,
  healthStateLabel,
  healthStateSlotClass,
} from './healthState';

describe('HEALTH_STATE_OPTIONS', () => {
  it('defines five unique levels in the expected layout slots', () => {
    expect(HEALTH_STATE_OPTIONS).toHaveLength(5);
    const levels = HEALTH_STATE_OPTIONS.map((option) => option.level);
    expect(new Set(levels).size).toBe(5);
    expect(HEALTH_STATE_OPTIONS.find((option) => option.slot === 'center')?.level).toBe('ok');
    expect(HEALTH_STATE_OPTIONS.find((option) => option.slot === 'top-right')?.level).toBe('amazing');
    expect(HEALTH_STATE_OPTIONS.find((option) => option.slot === 'mid-left')?.level).toBe('terrible');
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

describe('healthStateSlotClass', () => {
  it('maps slots to BEM modifier classes', () => {
    expect(healthStateSlotClass('center')).toBe('health-state-picker__option--center');
    expect(healthStateSlotClass('top-right')).toBe('health-state-picker__option--top-right');
  });
});

describe('compareHealthStateLevels', () => {
  it('orders levels from terrible to amazing', () => {
    expect(compareHealthStateLevels('terrible', 'amazing')).toBeLessThan(0);
    expect(compareHealthStateLevels('ok', 'ok')).toBe(0);
    expect(compareHealthStateLevels('good', 'poor')).toBeGreaterThan(0);
  });
});
