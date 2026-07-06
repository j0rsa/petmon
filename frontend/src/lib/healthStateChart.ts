import type { HealthStateRecord } from '../api/healthState';
import type { HealthStateLevel } from './healthState';
import { HEALTH_STATE_LEVELS, healthStateEmoji, healthStateLabel } from './healthState';

export type HealthStateGranularity = 'daily' | 'weekly';

export interface HealthStateSummaryBucket {
  bucket: string;
  medianScore: number;
  minScore: number;
  maxScore: number;
  count: number;
  medianLevel: HealthStateLevel;
}

export function healthStateScore(level: HealthStateLevel): number {
  return HEALTH_STATE_LEVELS.indexOf(level) + 1;
}

export function levelFromScore(score: number): HealthStateLevel {
  const clamped = Math.min(5, Math.max(1, Math.round(score)));
  return HEALTH_STATE_LEVELS[clamped - 1];
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Monday-based week start, matching the weight summary bucketing. */
export function weekStart(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  const daysSinceMonday = (value.getDay() + 6) % 7;
  value.setDate(value.getDate() - daysSinceMonday);
  return value.toISOString().slice(0, 10);
}

export function buildHealthStateSummary(
  records: HealthStateRecord[],
  granularity: HealthStateGranularity,
): HealthStateSummaryBucket[] {
  const groups = new Map<string, number[]>();

  for (const record of records) {
    const key = granularity === 'daily' ? record.local_date : weekStart(record.local_date);
    const scores = groups.get(key) ?? [];
    scores.push(healthStateScore(record.level));
    groups.set(key, scores);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, scores]) => {
      const medianScore = median(scores);
      return {
        bucket,
        medianScore,
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        count: scores.length,
        medianLevel: levelFromScore(medianScore),
      };
    });
}

export function formatHealthStateBucket(bucket: string, granularity: HealthStateGranularity): string {
  const dt = new Date(`${bucket}T00:00:00`);
  if (granularity === 'weekly') {
    return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
  }
  return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
}

export function formatHealthStateScore(score: number): string {
  const level = levelFromScore(score);
  return `${healthStateEmoji(level)} ${healthStateLabel(level)}`;
}
