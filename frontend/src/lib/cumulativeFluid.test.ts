import { describe, expect, it } from 'vitest';
import {
  buildCumulativeFluidChart,
  dailyScheduleMaxMl,
  expectedScheduledFluidMl,
  scheduleProjectionAt,
} from './cumulativeFluid';
import type { NutritionRecord, NutritionSchedule } from '../types';

const liquidWindowsSchedule: NutritionSchedule = {
  id: 'sched-liquid',
  pet_id: 'pet-1',
  name: 'Liquid',
  active: true,
  notify: false,
  rules_json: JSON.stringify({
    type: 'liquid',
    windows: [
      { from: '08:00', min: 10, max: 100 },
      { from: '12:00', min: 20, max: 50 },
    ],
  }),
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

describe('scheduleProjectionAt', () => {
  const windows = JSON.parse(liquidWindowsSchedule.rules_json).windows;

  it('steps up at each window from time', () => {
    expect(scheduleProjectionAt(windows, 7 * 60 + 59)).toBe(0);
    expect(scheduleProjectionAt(windows, 8 * 60)).toBe(100);
    expect(scheduleProjectionAt(windows, 11 * 60 + 59)).toBe(100);
    expect(scheduleProjectionAt(windows, 12 * 60)).toBe(150);
  });
});

describe('expectedScheduledFluidMl', () => {
  it('uses full daily max for a past day', () => {
    const windows = JSON.parse(liquidWindowsSchedule.rules_json).windows;
    expect(dailyScheduleMaxMl(windows)).toBe(150);
    expect(expectedScheduledFluidMl([liquidWindowsSchedule], '2020-01-01', '2025-06-01')).toBe(150);
  });

  it('returns null when there is no liquid schedule', () => {
    expect(expectedScheduledFluidMl([], '2020-01-01', '2025-06-01')).toBeNull();
  });
});

describe('buildCumulativeFluidChart', () => {
  it('keeps curves and the timeline anchored to the full day', () => {
    const record: NutritionRecord = {
      id: 'record-1',
      pet_id: 'pet-1',
      occurred_at: '2024-01-01T12:00:00Z',
      local_date: '2024-01-01',
      category: 'liquids',
      amount: 40,
      unit: 'ml',
      note: null,
      source_type: 'manual',
      created_at: '2024-01-01T12:00:00Z',
      updated_at: '2024-01-01T12:00:00Z',
    };

    const chart = buildCumulativeFluidChart([record], '2024-01-01', []);

    expect(chart.points[0]).toMatchObject({ label: '00:00', total: 0 });
    expect(chart.points.at(-1)).toMatchObject({ label: '23:59', total: 40 });
  });
});
