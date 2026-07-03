import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { HealthStateGranularity, HealthStateSummaryBucket } from '../../lib/healthStateChart';
import {
  formatHealthStateBucket,
  formatHealthStateScore,
  levelFromScore,
} from '../../lib/healthStateChart';
import { healthStateEmoji } from '../../lib/healthState';

const Y_TICKS = [1, 2, 3, 4, 5];

export interface HealthStateChartProps {
  buckets: HealthStateSummaryBucket[];
  granularity: HealthStateGranularity;
}

export function HealthStateChart({ buckets, granularity }: HealthStateChartProps) {
  const chartData = buckets.map((bucket) => ({
    bucket: formatHealthStateBucket(bucket.bucket, granularity),
    medianScore: bucket.medianScore,
    minScore: bucket.minScore,
    maxScore: bucket.maxScore,
    count: bucket.count,
    medianLevel: bucket.medianLevel,
  }));

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
          contentStyle={{
            background: 'var(--surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value, name, item) => {
            const score = Number(value ?? 0);
            const count = item.payload.count as number;
            if (name === 'Min' || name === 'Max') {
              return [formatHealthStateScore(score), name];
            }
            const label = formatHealthStateScore(score);
            return [count > 1 ? `${label} (${count} check-ins)` : label, 'Median'];
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
      </ComposedChart>
    </ResponsiveContainer>
  );
}
