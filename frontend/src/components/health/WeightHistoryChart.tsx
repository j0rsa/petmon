import { useMemo, useState } from 'react';
import { useTime } from '../../context/useTime';
import {
  CartesianGrid,
  ComposedChart,
  DefaultLegendContent,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightGranularity, WeightSummaryBucket } from '../../api/weight';
import { buildWeightChart, weightSeriesKey } from '../../lib/weightChart';

interface WeightHistoryChartProps {
  buckets: WeightSummaryBucket[];
  granularity: WeightGranularity;
  isFetching?: boolean;
}

export function WeightHistoryChart({ buckets, granularity, isFetching = false }: WeightHistoryChartProps) {
  const { timeZone } = useTime();
  const [soloTag, setSoloTag] = useState<string | null>(null);
  const { points, tags, visibleTags, medianKg } = useMemo(
    () => buildWeightChart(buckets, granularity, soloTag, timeZone),
    [buckets, granularity, soloTag, timeZone],
  );

  if (points.length < 2) {
    return (
      <p className="muted-text" style={{ fontSize: '0.88rem' }}>
        {points.length === 0 ? 'No measurements yet.' : 'Add at least 2 measurements to see a chart.'}
      </p>
    );
  }

  const showRange = granularity !== 'raw' && visibleTags.length === 1;
  const hasTrend = points.some((point) => point.trendKg != null);
  const legendPayload = tags.map((tag) => ({
    value: `#${tag.tag}`,
    type: 'line' as const,
    color: tag.color,
    inactive: soloTag !== null && soloTag.toLowerCase() !== tag.tag.toLowerCase(),
    dataKey: weightSeriesKey(tag.tag),
  }));

  function handleLegendClick(entry: { value?: string }) {
    const tag = tags.find((item) => `#${item.tag}` === entry.value);
    if (!tag) return;
    setSoloTag((current) => (current?.toLowerCase() === tag.tag.toLowerCase() ? null : tag.tag));
  }

  return (
    <div className="weight-history-chart" style={{ position: 'relative', minHeight: 200 }}>
      {isFetching && (
        <div className="weight-history-chart-loading">Loading…</div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} minTickGap={20} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} domain={['auto', 'auto']} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const visibleKeys = new Set(visibleTags.map((tag) => weightSeriesKey(tag.tag)));
              const seriesRows = payload.filter(
                (entry) => typeof entry.dataKey === 'string' && visibleKeys.has(entry.dataKey) && entry.value != null,
              );
              const minEntry = payload.find((entry) => entry.dataKey === 'minKg');
              const maxEntry = payload.find((entry) => entry.dataKey === 'maxKg');
              return (
                <div className="weight-chart-tooltip">
                  <p className="weight-chart-tooltip-label">{label}</p>
                  {seriesRows.map((entry) => (
                    <p key={String(entry.dataKey)} style={{ margin: 0, color: String(entry.color ?? 'inherit') }}>
                      {entry.name}: {Number(entry.value).toFixed(2)} kg
                    </p>
                  ))}
                  {medianKg != null && (
                    <p style={{ margin: 0 }}>Median weight: {medianKg.toFixed(2)} kg</p>
                  )}
                  {showRange && minEntry && (
                    <p style={{ margin: 0 }}>Min: {Number(minEntry.value).toFixed(2)} kg</p>
                  )}
                  {showRange && maxEntry && (
                    <p style={{ margin: 0 }}>Max: {Number(maxEntry.value).toFixed(2)} kg</p>
                  )}
                </div>
              );
            }}
          />
          {tags.length > 0 && (
            <Legend
              className="chart-legend-interactive"
              wrapperStyle={{ fontFamily: 'DM Mono, monospace', fontSize: 12 }}
              content={(props) => (
                <DefaultLegendContent
                  {...props}
                  payload={legendPayload}
                  onClick={(entry) => handleLegendClick(entry)}
                />
              )}
            />
          )}
          {showRange && (
            <>
              <Line type="monotone" dataKey="minKg" name="Min" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" dot={false} strokeOpacity={0.35} legendType="none" />
              <Line type="monotone" dataKey="maxKg" name="Max" stroke="var(--accent)" strokeWidth={1} strokeDasharray="3 2" dot={false} strokeOpacity={0.35} legendType="none" />
            </>
          )}
          {visibleTags.map((tag) => (
            <Line
              key={tag.tag}
              type="monotone"
              dataKey={weightSeriesKey(tag.tag)}
              name={`#${tag.tag}`}
              stroke={tag.color}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
          {hasTrend && (
            <Line
              type="linear"
              dataKey="trendKg"
              name="trendKg"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              activeDot={false}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
