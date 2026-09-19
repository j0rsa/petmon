import { describe, expect, it } from 'vitest';
import { toCreateNutritionRecords, parseTelegramNutritionLog } from './parseTelegramNutritionLog';
import { exportTelegramLog } from './exportTelegramLog';
import { timeLabelFromOccurredAt, buildCumulativeFluidChart } from './cumulativeFluid';
import { formatWeightBucket } from './weightChart';
import type { NutritionRecord } from '../types';

function record(occurred_at: string): NutritionRecord {
  return { id: occurred_at, pet_id: 'p', occurred_at, local_date: '2026-10-24', category: 'liquids', amount: 10, unit: 'ml', source_type: 'manual', created_at: occurred_at, updated_at: occurred_at };
}

describe('UTC record consumers', () => {
  it('formats chart clock values in the configured timezone', () => {
    expect(timeLabelFromOccurredAt('2026-01-01T00:30:00Z', 'America/Los_Angeles')).toBe('16:30');
    expect(formatWeightBucket('2026-01-01T00:30:00Z', 'raw', 'America/Los_Angeles')).toBe('31 Dec 16:30');
    const chart = buildCumulativeFluidChart([record('2026-01-01T00:30:00Z')], '2026-01-01', [], undefined, undefined, 'Asia/Tokyo');
    expect(chart.points.some((point) => point.label === '09:30')).toBe(true);
  });
  it('imports wall-clock logs in the configured timezone without converting credit dates', () => {
    const entries = parseTelegramNutritionLog('Staging Bot, [1. Jan 2026 at 00:30:00]:\n#cat_ate #liquids 10');
    expect(toCreateNutritionRecords(entries, 'p', 'Asia/Tokyo')[0]).toMatchObject({ occurred_at: '2025-12-31T15:30:00.000Z', local_date: '2026-01-01' });
  });
  it('rejects ambiguous imports until supplied an explicit offset', () => {
    const text = 'Staging Bot, [25. Oct 2026 at 02:30:00]:\n#cat_ate #liquids 10';
    expect(() => toCreateNutritionRecords(parseTelegramNutritionLog(text), 'p', 'Europe/Berlin')).toThrow('occurs twice');
    expect(toCreateNutritionRecords(parseTelegramNutritionLog(text.replace('02:30:00]', '02:30:00 +01:00]')), 'p', 'Europe/Berlin')[0].occurred_at).toBe('2026-10-25T01:30:00.000Z');
  });
  it('exports repeated clock times as distinct explicit-offset instants', () => {
    const text = exportTelegramLog([record('2026-10-25T00:30:00Z'), record('2026-10-25T01:30:00Z')], 'Europe/Berlin');
    expect(text).toContain('02:30:00 +02:00');
    expect(text).toContain('02:30:00 +01:00');
    const records = toCreateNutritionRecords(parseTelegramNutritionLog(text), 'p', 'Europe/Berlin');
    expect(records.map((entry) => entry.occurred_at)).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']);
  });
});
