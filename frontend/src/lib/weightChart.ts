import type { WeightGranularity, WeightSummaryBucket } from '../api/weight';
import { linReg } from './linReg';

export type WeightPeriodLabel = '30d' | '90d' | '1y' | 'all';

export const WEIGHT_CHART_PERIODS: {
  label: WeightPeriodLabel;
  days: number | null;
  granularity: WeightGranularity;
}[] = [
  { label: '30d', days: 30, granularity: 'daily' },
  { label: '90d', days: 90, granularity: 'weekly' },
  { label: '1y', days: 365, granularity: 'monthly' },
  { label: 'all', days: null, granularity: 'monthly' },
];

export const WEIGHT_TAG_COLORS = [
  'var(--accent)',
  '#5b8def',
  '#3db88a',
  '#c084fc',
  '#e8b84a',
  '#f07178',
];

export interface WeightChartTag {
  tag: string;
  color: string;
  count: number;
}

export interface WeightChartPoint {
  bucket: string;
  label: string;
  minKg: number | null;
  maxKg: number | null;
  trendKg: number | null;
  [key: string]: string | number | null;
}

export function weightSeriesKey(tag: string): string {
  return `tag:${tag}`;
}

export function collectWeightTags(buckets: WeightSummaryBucket[]): WeightChartTag[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const bucket of buckets) {
    const tag = bucket.tag || 'manual';
    const existing = counts.get(tag.toLowerCase());
    if (existing) {
      existing.count += bucket.count;
    } else {
      counts.set(tag.toLowerCase(), { tag, count: bucket.count });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .map((item, index) => ({
      ...item,
      color: WEIGHT_TAG_COLORS[index % WEIGHT_TAG_COLORS.length],
    }));
}

export function formatWeightBucket(bucket: string, granularity: WeightGranularity, timeZone?: string): string {
  if (granularity === 'raw') {
    const dt = new Date(bucket);
    return new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(dt).replace(',', '');
  }
  const dt = new Date(`${bucket}T00:00:00`);
  if (granularity === 'monthly') {
    return dt.toLocaleString('en', { month: 'short', year: '2-digit' });
  }
  return `${dt.getDate()} ${dt.toLocaleString('en', { month: 'short' })}`;
}

export function buildWeightChart(
  buckets: WeightSummaryBucket[],
  granularity: WeightGranularity,
  soloTag: string | null,
  timeZone?: string,
): { points: WeightChartPoint[]; tags: WeightChartTag[]; visibleTags: WeightChartTag[]; medianKg: number | null } {
  const tags = collectWeightTags(buckets);
  const visibleTags = soloTag
    ? tags.filter((item) => item.tag.toLowerCase() === soloTag.toLowerCase())
    : tags;

  const byBucket = new Map<string, WeightSummaryBucket[]>();
  for (const bucket of buckets) {
    const list = byBucket.get(bucket.bucket) ?? [];
    list.push(bucket);
    byBucket.set(bucket.bucket, list);
  }

  const points: WeightChartPoint[] = [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, group]) => {
      const visible = visibleTags.length === 0
        ? group
        : group.filter((item) => visibleTags.some((tag) => tag.tag.toLowerCase() === (item.tag || 'manual').toLowerCase()));
      const point: WeightChartPoint = {
        bucket,
        label: formatWeightBucket(bucket, granularity, timeZone),
        minKg: visible.length ? Math.min(...visible.map((item) => item.min_kg)) : null,
        maxKg: visible.length ? Math.max(...visible.map((item) => item.max_kg)) : null,
        trendKg: null,
      };
      for (const tag of tags) {
        const match = group.find((item) => (item.tag || 'manual').toLowerCase() === tag.tag.toLowerCase());
        point[weightSeriesKey(tag.tag)] = match ? match.avg_kg : null;
      }
      return point;
    });

  const combined = points.map((point) => {
    let weighted = 0;
    let count = 0;
    for (const tag of visibleTags) {
      const value = point[weightSeriesKey(tag.tag)];
      if (typeof value === 'number') {
        const bucket = buckets.find((item) => item.bucket === point.bucket && (item.tag || 'manual').toLowerCase() === tag.tag.toLowerCase());
        const n = bucket?.count ?? 1;
        weighted += value * n;
        count += n;
      }
    }
    return count > 0 ? weighted / count : null;
  });
  const trend = linReg(combined);
  const withTrend = points.map((point, index) => ({
    ...point,
    trendKg: trend?.[index] ?? null,
  }));

  const medianValues = combined.filter((value): value is number => value != null);
  const medianKg = medianWeight(medianValues);

  return { points: withTrend, tags, visibleTags, medianKg };
}

function medianWeight(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
