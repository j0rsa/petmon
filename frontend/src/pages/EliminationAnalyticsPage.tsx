import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { eliminationApi } from '../api/elimination';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';

const PERIODS = [
  { label: '7d',  days: 7  },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

type PeriodLabel = typeof PERIODS[number]['label'];

const EVENT_TYPE_COLORS: Record<string, string> = {
  urination:  'var(--metric-water)',
  defecation: 'var(--metric-wet)',
  vomit:      'var(--error-text)',
  general:    'var(--text-muted)',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  urination:  'Urination',
  defecation: 'Defecation',
  vomit:      'Vomit',
  general:    'General',
};

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

export default function EliminationAnalyticsPage() {
  const { selectedPetId, petsLoading } = useSelectedPet();
  const [period, setPeriod] = useState<PeriodLabel>('30d');

  const today = localToday();
  const days = PERIODS.find((p) => p.label === period)!.days;
  const dateFrom = shiftDate(today, -(days - 1));

  const analyticsQuery = useQuery({
    queryKey: ['elimination-analytics', dateFrom, today, selectedPetId],
    queryFn: () => eliminationApi.rangeSummary(dateFrom, today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  // Build per-day totals keyed by date, with counts by type
  const dailyData = useMemo(() => {
    const summaryMap = new Map<string, {
      total: number;
      urination: number;
      defecation: number;
      vomit: number;
      general: number;
    }>();

    for (const s of analyticsQuery.data?.daily_summaries ?? []) {
      summaryMap.set(s.local_date, {
        total: s.total_count,
        urination: s.urination_count,
        defecation: s.defecation_count,
        vomit: s.vomit_count,
        general: s.general_count,
      });
    }

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = shiftDate(today, -(days - 1 - i));
      const row = summaryMap.get(date);
      result.push({
        date,
        total: row?.total ?? 0,
        urination: row?.urination ?? 0,
        defecation: row?.defecation ?? 0,
        vomit: row?.vomit ?? 0,
        general: row?.general ?? 0,
      });
    }
    return result;
  }, [analyticsQuery.data, days, today]);

  // Stats: avg/day, p50, p90, vomit-days count
  const stats = useMemo(() => {
    const data = analyticsQuery.data;
    if (!data) return null;
    const vomitDays = data.daily_summaries.filter((s) => s.has_vomit).length;
    return {
      avgPerDay: data.avg_per_day,
      p50: data.p50_per_day,
      p90: data.p90_per_day,
      vomitDays,
    };
  }, [analyticsQuery.data]);

  // Vomit days list
  const vomitDays = useMemo(() => {
    return (analyticsQuery.data?.daily_summaries ?? [])
      .filter((s) => s.has_vomit)
      .sort((a, b) => b.local_date.localeCompare(a.local_date));
  }, [analyticsQuery.data]);

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) return <NoPetSelected />;

  return (
    <div className="page-stack">
      {/* Period selector */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {PERIODS.map((p) => (
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
        <div className="error-state">
          {analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Failed to load analytics.'}
        </div>
      ) : (
        <>
          {/* Stat cards */}
          {stats && (
            <div className="summary-grid">
              <StatCard label="avg visits / day" value={stats.avgPerDay.toFixed(1)} color="var(--accent)" />
              <StatCard label="p50 visits" value={stats.p50.toFixed(1)} color="var(--metric-water)" />
              <StatCard label="p90 visits" value={stats.p90.toFixed(1)} color="var(--metric-wet)" />
              <StatCard label="vomit days" value={String(stats.vomitDays)} color="var(--error-text)" />
            </div>
          )}

          {/* Stacked bar chart by event type */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>daily visits by event type</p>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} barCategoryGap="20%" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
                    allowDecimals={false}
                  />
                  <Tooltip
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }} />
                  <Bar dataKey="urination"  name="Urination"  stackId="day" fill={EVENT_TYPE_COLORS.urination}  radius={[0, 0, 0, 0]} />
                  <Bar dataKey="defecation" name="Defecation" stackId="day" fill={EVENT_TYPE_COLORS.defecation} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="vomit"      name="Vomit"      stackId="day" fill={EVENT_TYPE_COLORS.vomit}      radius={[0, 0, 0, 0]} />
                  <Bar dataKey="general"    name="General"    stackId="day" fill={EVENT_TYPE_COLORS.general}    radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Trend line chart — total visits per day */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>total visits per day</p>
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
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(v) => [`${v ?? 0}`, 'visits']}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="total visits"
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

          {/* Vomit days list */}
          {vomitDays.length > 0 && (
            <section className="panel">
              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
                vomit days ({vomitDays.length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {vomitDays.map((s) => (
                  <div key={s.local_date} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{s.local_date}</span>
                    <span style={{ color: 'var(--error-text)', fontSize: '0.82rem' }}>{s.vomit_count} vomit{s.vomit_count === 1 ? '' : 's'}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{s.total_count} total</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="stat-card">
      <span className="metric-label">{label}</span>
      <strong style={{ color, fontFamily: 'monospace', fontSize: '2rem' }}>
        {value}
      </strong>
    </div>
  );
}

export { EVENT_TYPE_LABELS };
