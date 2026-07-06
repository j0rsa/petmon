import { useMemo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { HealthStateGranularity, HealthStateSummaryBucket } from '../../lib/healthStateChart';
import {
  formatHealthStateBucket,
  formatHealthStateScore,
  levelFromScore,
} from '../../lib/healthStateChart';
import { healthStateEmoji } from '../../lib/healthState';
import { linReg } from '../../lib/linReg';

const Y_TICKS = [1, 2, 3, 4, 5];

const TOOLTIP_SERIES: { dataKey: string; label: string }[] = [
  { dataKey: 'maxScore', label: 'Max' },
  { dataKey: 'medianScore', label: 'Median' },
  { dataKey: 'minScore', label: 'Min' },
];

export interface HealthStateChartProps {
  buckets: HealthStateSummaryBucket[];
  granularity: HealthStateGranularity;
}

export function HealthStateChart({ buckets, granularity }: HealthStateChartProps) {
  const chartData = useMemo(() => {
    const scoreTrend = linReg(
      buckets.map((bucket) => bucket.medianScore),
      { min: 1, max: 5 },
    );
    return buckets.map((bucket, i) => ({
      bucket: formatHealthStateBucket(bucket.bucket, granularity),
      medianScore: bucket.medianScore,
      minScore: bucket.minScore,
      maxScore: bucket.maxScore,
      count: bucket.count,
      medianLevel: bucket.medianLevel,
      trendScore: scoreTrend?.[i] ?? null,
    }));
  }, [buckets, granularity]);

  const scoreTrend = chartData.some((point) => point.trendScore != null);

  const showRange = granularity === 'daily' && chartData.some((point) => point.count > 1);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[1, 5]}
          ticks={Y_TICKS}
          tick={{ fontSize: 14, fill: 'var(--text-muted)' }}
          tickFormatter={(value) => healthStateEmoji(levelFromScore(Number(value)))}
          width={32}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const count = payload[0]?.payload?.count as number | undefined;
            return (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  fontSize: 12,
                  padding: '0.5rem 0.75rem',
                }}
              >
                <p style={{ margin: '0 0 4px', color: 'var(--text-muted)' }}>{label}</p>
                {TOOLTIP_SERIES.map(({ dataKey, label: seriesLabel }) => {
                  const entry = payload.find((item) => item.dataKey === dataKey);
                  if (entry?.value == null) return null;
                  const formatted = formatHealthStateScore(Number(entry.value));
                  const value =
                    dataKey === 'medianScore' && count != null && count > 1
                      ? `${formatted} (${count} check-ins)`
                      : formatted;
                  return (
                    <p key={dataKey} style={{ margin: 0 }}>
                      {seriesLabel}: {value}
                    </p>
                  );
                })}
              </div>
            );
          }}
        />
        {showRange && (
          <>
            <Line
              type="monotone"
              dataKey="minScore"
              name="Min"
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="3 2"
              dot={false}
              strokeOpacity={0.35}
              legendType="none"
            />
            <Line
              type="monotone"
              dataKey="maxScore"
              name="Max"
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="3 2"
              dot={false}
              strokeOpacity={0.35}
              legendType="none"
            />
          </>
        )}
        <Line
          type="monotone"
          dataKey="medianScore"
          name="Median"
          stroke="var(--accent)"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {scoreTrend && (
          <Line
            type="linear"
            dataKey="trendScore"
            name="Trend"
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
  );
}
