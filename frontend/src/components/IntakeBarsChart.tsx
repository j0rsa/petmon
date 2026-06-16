import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { timeLabelFromOccurredAt } from '../lib/cumulativeFluid';
import type { NutritionRecord } from '../types';

const CHART_CATEGORIES = ['liquids', 'water', 'wet_food'] as const;

const CHART_COLORS: Record<string, string> = {
  liquids: '#4fd8f8',
  water: '#a0e8f8',
  wet_food: '#4fc8a0',
};

const CHART_LABELS: Record<string, string> = {
  liquids: 'liquids',
  water: 'water',
  wet_food: 'wet food',
};

interface IntakeBarsChartProps {
  records: NutritionRecord[];
}

export function IntakeBarsChart({ records }: IntakeBarsChartProps) {
  const { chartData, presentCategories } = useMemo(() => {
    const relevant = records.filter((r) =>
      (CHART_CATEGORIES as readonly string[]).includes(r.category),
    );
    const grouped = new Map<string, Record<string, number | string>>();
    for (const record of relevant) {
      const label = timeLabelFromOccurredAt(record.occurred_at);
      const point = grouped.get(label) ?? { label };
      const current = typeof point[record.category] === 'number' ? (point[record.category] as number) : 0;
      point[record.category] = current + record.amount;
      grouped.set(label, point);
    }
    const data = [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, point]) => point);

    const present = CHART_CATEGORIES.filter((cat) => data.some((point) => point[cat] != null));
    return { chartData: data, presentCategories: present };
  }, [records]);

  if (chartData.length === 0) {
    return <div className="empty-state compact-empty">No fluid records for this day.</div>;
  }

  return (
    <div className="chart-wrapper chart-wrapper-intake">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} barCategoryGap="35%">
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
          />
          <YAxis
            stroke="var(--chart-axis)"
            tick={{ fill: 'var(--chart-axis)', fontFamily: 'DM Mono, monospace', fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          {presentCategories.map((cat) => (
            <Bar key={cat} dataKey={cat} name={CHART_LABELS[cat]} fill={CHART_COLORS[cat]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
