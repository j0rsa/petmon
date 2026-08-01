import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { eliminationApi } from '../api/elimination';
import { NoPetSelected } from '../components/NoPetSelected';
import { StatCard } from '../components/StatCard';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';
import { AlertIcon, ClockIcon, TrendUpIcon } from '../lib/metricIcons';
import { linReg } from '../lib/linReg';

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
  urination:  'Wee',
  defecation: 'Poop',
  vomit:      'Vomit',
  general:    'General',
};

/** Bottom-to-top stack in the daily visits chart. */
const EVENT_TYPE_STACK_ORDER = ['defecation', 'vomit', 'urination', 'general'] as const;

/** Legend order (independent of stack order). */
const EVENT_TYPE_LEGEND_ORDER = ['general', 'defecation', 'vomit', 'urination'] as const;

const DURATION_STAT_TYPES = [
  {
    key: 'urination' as const,
    statLabel: 'wee median time spent',
    color: EVENT_TYPE_COLORS.urination,
  },
  {
    key: 'defecation' as const,
    statLabel: 'poo median time spent',
    color: EVENT_TYPE_COLORS.defecation,
  },
];

const DURATION_SERIES = [
  { dataKey: 'urinationAvgDuration', trendKey: 'urinationDurationTrend', type: 'urination' },
  { dataKey: 'defecationAvgDuration', trendKey: 'defecationDurationTrend', type: 'defecation' },
  { dataKey: 'generalAvgDuration', trendKey: 'generalDurationTrend', type: 'general' },
] as const;

function medianAndMean(values: Array<number | null>) {
  const vals = values.filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!vals.length) return null;
  const mid = Math.floor(vals.length / 2);
  const median = vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
  const mean = vals.reduce((sum, v) => sum + v, 0) / vals.length;
  return { median, mean };
}

function hasDurationChartData(values: Array<number | null>) {
  return values.some((v) => v != null);
}

function formatDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
}

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
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

  // Build per-day totals + avg duration keyed by date
  const dailyData = useMemo(() => {
    const summaryMap = new Map<string, {
      total: number; urination: number; defecation: number;
      vomit: number; general: number;
      urinationAvgDuration: number | null;
      defecationAvgDuration: number | null;
      generalAvgDuration: number | null;
    }>();

    for (const s of analyticsQuery.data?.daily_summaries ?? []) {
      summaryMap.set(s.local_date, {
        total: s.total_count,
        urination: s.urination_count,
        defecation: s.defecation_count,
        vomit: s.vomit_count,
        general: s.general_count,
        urinationAvgDuration: s.urination_avg_duration_seconds ?? null,
        defecationAvgDuration: s.defecation_avg_duration_seconds ?? null,
        generalAvgDuration: s.general_avg_duration_seconds ?? null,
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
        toiletVisits: (row?.urination ?? 0) + (row?.defecation ?? 0) + (row?.general ?? 0),
        urinationAvgDuration: row?.urinationAvgDuration ?? null,
        defecationAvgDuration: row?.defecationAvgDuration ?? null,
        generalAvgDuration: row?.generalAvgDuration ?? null,
      });
    }
    return result;
  }, [analyticsQuery.data, days, today]);

  // Stats: p50 (median) + vomit days + deviation from avg
  const stats = useMemo(() => {
    const data = analyticsQuery.data;
    if (!data) return null;
    const vomitDays = data.daily_summaries.filter((s) => s.has_vomit).length;
    return { median: data.p50_per_day, avg: data.avg_per_day, vomitDays };
  }, [analyticsQuery.data]);

  // Regression trend lines
  const visitTrend = useMemo(
    () => linReg(dailyData.map((d) => d.toiletVisits), { min: 0 }),
    [dailyData],
  );
  const urinationDurationTrend = useMemo(
    () => linReg(dailyData.map((d) => d.urinationAvgDuration), { min: 0 }),
    [dailyData],
  );
  const defecationDurationTrend = useMemo(
    () => linReg(dailyData.map((d) => d.defecationAvgDuration), { min: 0 }),
    [dailyData],
  );
  const generalDurationTrend = useMemo(
    () => linReg(dailyData.map((d) => d.generalAvgDuration), { min: 0 }),
    [dailyData],
  );

  const durationTrends = {
    urinationDurationTrend,
    defecationDurationTrend,
    generalDurationTrend,
  } as const;

  const durationStats = useMemo(() => ({
    urination: medianAndMean(dailyData.map((d) => d.urinationAvgDuration)),
    defecation: medianAndMean(dailyData.map((d) => d.defecationAvgDuration)),
  }), [dailyData]);

  // Combined chart data (visits + duration + trend lines)
  const chartData = useMemo(
    () => dailyData.map((d, i) => ({
      ...d,
      visitTrend: visitTrend?.[i] ?? null,
      urinationDurationTrend: urinationDurationTrend?.[i] ?? null,
      defecationDurationTrend: defecationDurationTrend?.[i] ?? null,
      generalDurationTrend: generalDurationTrend?.[i] ?? null,
    })),
    [dailyData, visitTrend, urinationDurationTrend, defecationDurationTrend, generalDurationTrend],
  );

  const showDurationChart = useMemo(
    () => hasDurationChartData(
      dailyData.flatMap((d) => [d.urinationAvgDuration, d.defecationAvgDuration, d.generalAvgDuration]),
    ),
    [dailyData],
  );

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
              <StatCard
                label="median visits / day"
                value={stats.median.toFixed(1)}
                color="var(--accent)"
                icon={<TrendUpIcon />}
                current={stats.median}
                avg={stats.avg}
              />
              {DURATION_STAT_TYPES.map(({ key, statLabel, color }) => {
                const typeStats = durationStats[key];
                if (!typeStats) return null;
                return (
                  <StatCard
                    key={key}
                    label={statLabel}
                    value={fmtSec(typeStats.median)}
                    color={color}
                    icon={<ClockIcon />}
                    current={typeStats.median}
                    avg={typeStats.mean}
                    avgLabel={`avg ${fmtSec(typeStats.mean)}`}
                  />
                );
              })}
              <StatCard
                label="vomit days"
                value={String(stats.vomitDays)}
                color="var(--error-text)"
                icon={<AlertIcon />}
                note={days > 0 ? `${Math.round((stats.vomitDays / days) * 100)}% of period` : undefined}
              />
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
                  <Legend
                    wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }}
                    payload={EVENT_TYPE_LEGEND_ORDER.map((type) => ({
                      value: EVENT_TYPE_LABELS[type],
                      type: 'square',
                      color: EVENT_TYPE_COLORS[type],
                    }))}
                  />
                  {EVENT_TYPE_STACK_ORDER.map((type, index) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      name={EVENT_TYPE_LABELS[type]}
                      stackId="day"
                      fill={EVENT_TYPE_COLORS[type]}
                      radius={index === EVENT_TYPE_STACK_ORDER.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Trend line chart — total visits per day */}
          <section className="panel">
            <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>visits per day — trend</p>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(v, name) => name === 'visitTrend' ? [Number(v).toFixed(1), 'trend'] : [`${v ?? 0}`, 'visits']}
                    labelFormatter={(label) => formatDate(String(label))}
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                  />
                  {stats && <ReferenceLine y={stats.median} stroke="var(--text-subtle)" strokeDasharray="5 4" label={{ value: `median ${stats.median.toFixed(1)}`, fill: 'var(--text-subtle)', fontSize: 10, position: 'insideTopRight' }} />}
                  <Line type="monotone" dataKey="toiletVisits" name="visits" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)', strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                  {visitTrend && <Line type="linear" dataKey="visitTrend" name="visitTrend" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={false} legendType="none" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Duration chart — wee, poo, and general with trend lines */}
          {showDurationChart && (
            <section className="panel">
              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>time spent</p>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)', fontFamily: 'monospace', fontSize: 11 }} tickFormatter={(v) => fmtSec(v)} width={42} />
                    <Tooltip
                      formatter={(v, name) => {
                        const strName = String(name);
                        const series = DURATION_SERIES.find((s) => s.dataKey === strName || s.trendKey === strName);
                        const label = series ? EVENT_TYPE_LABELS[series.type] : strName;
                        const isTrend = strName.endsWith('Trend');
                        if (v == null) return ['—', isTrend ? `${label} trend` : label];
                        return [fmtSec(Number(v)), isTrend ? `${label} trend` : label];
                      }}
                      labelFormatter={(label) => formatDate(String(label))}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }} />
                    {DURATION_SERIES.flatMap(({ dataKey, trendKey, type }) => {
                      const color = EVENT_TYPE_COLORS[type];
                      const label = EVENT_TYPE_LABELS[type];
                      const trend = durationTrends[trendKey];
                      const lines = [
                        <Line
                          key={dataKey}
                          type="monotone"
                          dataKey={dataKey}
                          name={label}
                          stroke={color}
                          strokeWidth={2}
                          dot={{ r: 3, fill: color, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          connectNulls
                        />,
                      ];
                      if (trend) {
                        lines.push(
                          <Line
                            key={trendKey}
                            type="linear"
                            dataKey={trendKey}
                            name={trendKey}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                            dot={false}
                            activeDot={false}
                            legendType="none"
                          />,
                        );
                      }
                      return lines;
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

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


export { EVENT_TYPE_LABELS };
