import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EliminationEventType, EliminationRecord } from '../api/elimination';

const CHART_KEYS: EliminationEventType[] = ['urination', 'defecation', 'general', 'vomit', 'no_output'];

const CHART_COLORS: Record<EliminationEventType, string> = {
  urination: 'var(--metric-water)',
  defecation: 'var(--metric-wet)',
  general: 'var(--text-muted)',
  vomit: 'var(--error-text)',
  no_output: 'var(--error-text)',
};

const CHART_LABELS: Record<EliminationEventType, string> = {
  urination: 'Wee',
  defecation: 'Poop',
  general: 'General',
  vomit: 'Vomit',
  no_output: 'Nothing',
};

const DEFAULT_DURATION_SECONDS = 30;

function formatDurationTick(seconds: number): string {
  if (seconds === 0) return '0';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m${s}s`;
}

interface EliminationDayChartProps {
  records: EliminationRecord[];
}

export function EliminationDayChart({ records }: EliminationDayChartProps) {
  const { chartData, presentTypes } = useMemo(() => {
    const data = [...records]
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
      .map((record) => {
        const point: Record<string, number | string> = {
          label: record.occurred_at.slice(11, 16),
        };
        for (const key of CHART_KEYS) {
          point[key] = 0;
        }
        point[record.event_type] = record.duration_seconds ?? DEFAULT_DURATION_SECONDS;
        return point;
      });

    const present = CHART_KEYS.filter((key) => data.some((point) => (point[key] as number) > 0));
    return { chartData: data, presentTypes: present };
  }, [records]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="day-charts-section">
      <div className="day-chart-block">
        <p className="eyebrow chart-label">visits through the day</p>
        <div className="chart-wrapper chart-wrapper-intake">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
              />
              <YAxis
                stroke="var(--chart-axis)"
                tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
                tickFormatter={formatDurationTick}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  fontFamily: 'monospace',
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  typeof value === 'number' ? formatDurationTick(value) : String(value ?? ''),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }} />
              {presentTypes.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  name={CHART_LABELS[key]}
                  stackId="visit"
                  fill={CHART_COLORS[key]}
                  radius={index === presentTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
