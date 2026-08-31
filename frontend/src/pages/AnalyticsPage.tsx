import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, DefaultLegendContent, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ANALYTICS_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../types';
import { nutritionAnalyticsApi } from '../api/analytics';
import { NoPetSelected } from '../components/NoPetSelected';
import { StatCard } from '../components/StatCard';
import { LiquidsIcon, TotalFluidIcon, TrendUpIcon, WetFoodIcon } from '../lib/metricIcons';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';
import { WET_FOOD_FLUID_RATIO } from '../lib/cumulativeFluid';

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: 'all', days: 90 },
] as const;

type PeriodLabel = typeof PERIODS[number]['label'];

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}


export default function AnalyticsPage() {
  const { selectedPetId, petsLoading } = useSelectedPet();
  const [period, setPeriod] = useState<PeriodLabel>('30d');
  const [soloCategory, setSoloCategory] = useState<typeof ANALYTICS_CATEGORIES[number] | null>(null);

  const today = localToday();
  const days = PERIODS.find(p => p.label === period)!.days;
  const dateFrom = shiftDate(today, -(days - 1));

  const analyticsQuery = useQuery({
    queryKey: ['nutrition-analytics', dateFrom, today, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.rangeSummary(dateFrom, today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  // Per-day totals keyed by date
  const dailyData = useMemo(() => {
    const map = new Map<string, { liquids: number; wet_food: number; water: number }>();
    for (const t of analyticsQuery.data?.daily_totals ?? []) {
      const row = map.get(t.local_date) ?? { liquids: 0, wet_food: 0, water: 0 };
      if (t.category === 'liquids') row.liquids = t.total_amount;
      else if (t.category === 'water') row.water = t.total_amount;
      else if (t.category === 'wet_food') row.wet_food = t.total_amount;
      map.set(t.local_date, row);
    }

    // Fill every date in range (even empty days)
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = shiftDate(today, -(days - 1 - i));
      const row = map.get(date) ?? { liquids: 0, wet_food: 0, water: 0 };
      const liquidTotal = row.liquids + row.water;
      const foodFluid = Math.round(row.wet_food * WET_FOOD_FLUID_RATIO);
      const totalFluid = liquidTotal + foodFluid;
      result.push({ date, liquidTotal, foodFluid, totalFluid, wet_food: row.wet_food });
    }
    return result;
  }, [analyticsQuery.data, days, today]);

  // Summary stats
  const stats = useMemo(() => {
    const filled = dailyData.filter(d => d.totalFluid > 0);
    if (filled.length === 0) return null;
    const avgTotal = Math.round(filled.reduce((s, d) => s + d.totalFluid, 0) / filled.length);
    const peakTotal = Math.max(...filled.map(d => d.totalFluid));
    const avgLiquids = Math.round(filled.reduce((s, d) => s + d.liquidTotal, 0) / filled.length);
    const avgWetFood = Math.round(filled.reduce((s, d) => s + d.wet_food, 0) / filled.length);
    return { avgTotal, peakTotal, avgLiquids, avgWetFood };
  }, [dailyData]);

  // All-category daily totals for the grouped bar chart
  const categoryChartData = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const t of analyticsQuery.data?.daily_totals ?? []) {
      const row = map.get(t.local_date) ?? {};
      row[t.category] = t.total_amount;
      map.set(t.local_date, row);
    }
    const result = [];
    for (let i = 0; i < days; i++) {
      const date = shiftDate(today, -(days - 1 - i));
      result.push({ date, ...(map.get(date) ?? {}) });
    }
    return result;
  }, [analyticsQuery.data, days, today]);

  // 100% stacked ratio data
  const ratioData = useMemo(() => {
    return dailyData.map(d => {
      const total = d.liquidTotal + d.foodFluid;
      if (total === 0) return { date: d.date, liquids: 0, foodFluid: 0 };
      return {
        date: d.date,
        liquids: Math.round((d.liquidTotal / total) * 100),
        foodFluid: Math.round((d.foodFluid / total) * 100),
      };
    });
  }, [dailyData]);

  const categoryLegendPayload = useMemo(
    () => ANALYTICS_CATEGORIES.map((cat) => ({
      value: CATEGORY_LABELS[cat],
      type: 'square' as const,
      color: CATEGORY_COLORS[cat],
      inactive: soloCategory !== null && soloCategory !== cat,
      dataKey: cat,
    })),
    [soloCategory],
  );

  const visibleCategories = soloCategory !== null
    ? ANALYTICS_CATEGORIES.filter((c) => c === soloCategory)
    : ANALYTICS_CATEGORIES;

  function handleCategoryLegendClick(entry: { value?: string }) {
    const cat = ANALYTICS_CATEGORIES.find((c) => CATEGORY_LABELS[c] === entry.value) ?? null;
    if (!cat) return;
    setSoloCategory((current) => (current === cat ? null : cat));
  }

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  return (
    <div className="page-stack">
      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {PERIODS.map(p => (
          <button
            key={p.label}
            type="button"
            className={`button${period === p.label ? '' : ' button-secondary'}`}
            style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
            onClick={() => setPeriod(p.label)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {analyticsQuery.isLoading ? (
        <div className="loading-state">Loading analytics…</div>
      ) : analyticsQuery.isError ? (
        <div className="error-state">{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Failed to load analytics.'}</div>
      ) : (
        <>
          {/* Stat cards */}
          {stats && (
            <div className="summary-grid">
              <StatCard label="avg total fluid / day" value={`~${stats.avgTotal}`} unit="ml" color="var(--accent)" icon={<TotalFluidIcon />} />
              <StatCard label="peak total fluid" value={`~${stats.peakTotal}`} unit="ml" color="var(--accent)" icon={<TrendUpIcon />} />
              <StatCard label="avg liquids / day" value={`${stats.avgLiquids}`} unit="ml" color="var(--metric-water)" icon={<LiquidsIcon />} />
              <StatCard label="avg wet food / day" value={`${stats.avgWetFood}`} unit="g" color="var(--metric-wet)" icon={<WetFoodIcon />} />
            </div>
          )}

          {/* Total fluid per day — line chart */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>total fluid per day (liquids + {Math.round(WET_FOOD_FLUID_RATIO * 100)}% wet food)</p>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                    unit=" ml"
                  />
                  <Tooltip
                    formatter={(v) => [`${v ?? 0} ml`, 'total fluid']}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalFluid"
                    name="total fluid"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Daily totals by category — grouped bar */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>daily totals by category</p>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} barCategoryGap="20%" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Legend
                    className="chart-legend-interactive"
                    wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }}
                    content={(props) => (
                      <DefaultLegendContent
                        {...props}
                        payload={categoryLegendPayload}
                        onClick={(entry) => handleCategoryLegendClick(entry as { value?: string })}
                      />
                    )}
                  />
                  {visibleCategories.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} name={CATEGORY_LABELS[cat]} fill={CATEGORY_COLORS[cat]} stackId="day" radius={i === visibleCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Liquids vs wet food ratio — 100% stacked bar */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>liquids vs wet food ratio</p>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ratioData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--chart-axis)"
                    tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }}
                    unit=" %"
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(v, name) => [`${v ?? 0}%`, String(name)]}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Bar dataKey="liquids" name="liquids" stackId="ratio" fill="#4fd8f8" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="foodFluid" name="wet food" stackId="ratio" fill="#4fc8a0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

