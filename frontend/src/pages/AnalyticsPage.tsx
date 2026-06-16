import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { nutritionAnalyticsApi } from '../api/analytics';
import { nutritionRecordsApi } from '../api/nutritionRecords';
import { nutritionSchedulesApi } from '../api/nutritionSchedules';
import { CategoryBadge } from '../components/CategoryBadge';
import { CumulativeFluidChart } from '../components/CumulativeFluidChart';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate } from '../lib/dates';
import { ANALYTICS_CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../types';

export default function AnalyticsPage() {
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const [dateFrom, setDateFrom] = useState(shiftDate(localToday(), -6));
  const [dateTo, setDateTo] = useState(localToday());

  const analyticsQuery = useQuery({
    queryKey: ['nutrition-analytics', dateFrom, dateTo, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.rangeSummary(dateFrom, dateTo, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });
  const recordsQuery = useQuery({
    queryKey: ['nutrition-records', dateFrom, dateTo, selectedPetId],
    queryFn: () =>
      nutritionRecordsApi.list({
        date_from: dateFrom,
        date_to: dateTo,
        pet_id: selectedPetId!,
      }),
    enabled: Boolean(selectedPetId),
  });
  const schedulesQuery = useQuery({
    queryKey: ['nutrition-schedules', selectedPetId],
    queryFn: () => nutritionSchedulesApi.list(selectedPetId!),
    enabled: Boolean(selectedPetId),
  });
  const bestDayQuery = useQuery({
    queryKey: ['nutrition-best-fluid-day', dateTo, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.bestFluidDay(dateTo, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();

    for (const total of analyticsQuery.data?.daily_totals ?? []) {
      if (!ANALYTICS_CATEGORIES.includes(total.category as (typeof ANALYTICS_CATEGORIES)[number])) {
        continue;
      }
      const row = grouped.get(total.local_date) ?? { local_date: total.local_date };
      row[total.category] = total.total_amount;
      grouped.set(total.local_date, row);
    }

    return [...grouped.values()].sort((left, right) => String(left.local_date).localeCompare(String(right.local_date)));
  }, [analyticsQuery.data?.daily_totals]);

  if (petsLoading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (!selectedPetId) {
    return <NoPetSelected />;
  }

  const isLoading = analyticsQuery.isLoading || recordsQuery.isLoading;
  const isError = analyticsQuery.isError || recordsQuery.isError;
  const errorMessage =
    (analyticsQuery.error instanceof Error && analyticsQuery.error.message) ||
    (recordsQuery.error instanceof Error && recordsQuery.error.message) ||
    'Unable to load analytics.';

  return (
    <div className="page-stack">
      <section className="panel filter-panel">
        <div className="form-row">
          <label htmlFor="analytics-from">From</label>
          <input id="analytics-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="analytics-to">To</label>
          <input id="analytics-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <p className="muted-text">Showing data for {selectedPet?.name ?? 'selected pet'}.</p>
      </section>

      {isLoading ? (
        <div className="loading-state">Loading analytics…</div>
      ) : isError ? (
        <div className="error-state">{errorMessage}</div>
      ) : (
        <>
          <section className="panel chart-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Fluid</p>
                <h3>Cumulative fluid by time of day</h3>
                <p className="muted-text">Showing {dateTo} with range context for best-day comparison.</p>
              </div>
            </div>
            <CumulativeFluidChart
              records={recordsQuery.data?.filter((r) => r.local_date === dateTo) ?? []}
              focusDate={dateTo}
              schedules={schedulesQuery.data ?? []}
              bestDayRecords={bestDayQuery.data?.records}
              bestDayDate={bestDayQuery.data?.local_date}
            />
          </section>

          <section className="panel chart-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Chart</p>
                <h3>Daily totals by category</h3>
              </div>
            </div>
            {chartData.length === 0 ? (
              <div className="empty-state">No totals found in the selected range.</div>
            ) : (
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
                    <XAxis dataKey="local_date" stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                    <YAxis stroke="var(--chart-axis)" tick={{ fill: 'var(--chart-axis)' }} />
                    <Tooltip />
                    <Legend />
                    {ANALYTICS_CATEGORIES.map((category) => (
                      <Bar
                        key={category}
                        dataKey={category}
                        name={CATEGORY_LABELS[category]}
                        fill={CATEGORY_COLORS[category]}
                        radius={[6, 6, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Summary</p>
                <h3>Category averages</h3>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Average amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ANALYTICS_CATEGORIES.map((category) => (
                    <tr key={category}>
                      <td>
                        <CategoryBadge category={category} />
                      </td>
                      <td>{analyticsQuery.data?.category_averages[category] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
