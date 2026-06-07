import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { analyticsApi } from '../api/analytics';
import { catsApi } from '../api/cats';
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../types';

function localDate(daysOffset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + daysOffset);
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const [dateFrom, setDateFrom] = useState(localDate(-6));
  const [dateTo, setDateTo] = useState(localDate());
  const [catId, setCatId] = useState('');

  const catsQuery = useQuery({ queryKey: ['cats'], queryFn: catsApi.list });
  const analyticsQuery = useQuery({
    queryKey: ['analytics', dateFrom, dateTo, catId],
    queryFn: () => analyticsApi.rangeSummary(dateFrom, dateTo, catId || undefined),
  });

  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();

    for (const total of analyticsQuery.data?.daily_totals ?? []) {
      const row = grouped.get(total.local_date) ?? { local_date: total.local_date };
      row[total.category] = total.total_amount;
      grouped.set(total.local_date, row);
    }

    return [...grouped.values()].sort((left, right) => String(left.local_date).localeCompare(String(right.local_date)));
  }, [analyticsQuery.data?.daily_totals]);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2>Daily intake trends</h2>
          <p className="muted-text">Review totals and category averages across a date range.</p>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="form-row">
          <label htmlFor="analytics-from">From</label>
          <input id="analytics-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="analytics-to">To</label>
          <input id="analytics-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="analytics-cat">Cat</label>
          <select id="analytics-cat" value={catId} onChange={(event) => setCatId(event.target.value)}>
            <option value="">All cats</option>
            {(catsQuery.data ?? []).map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {analyticsQuery.isLoading ? (
        <div className="loading-state">Loading analytics…</div>
      ) : analyticsQuery.isError ? (
        <div className="error-state">{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Unable to load analytics.'}</div>
      ) : (
        <>
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="local_date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    {CATEGORIES.map((category) => (
                      <Bar key={category} dataKey={category} name={CATEGORY_LABELS[category]} fill={CATEGORY_COLORS[category]} radius={[6, 6, 0, 0]} />
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
                  {CATEGORIES.map((category) => (
                    <tr key={category}>
                      <td>
                        <CategoryPill category={category} />
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

function CategoryPill({ category }: { category: string }) {
  return (
    <span className="badge" style={{ backgroundColor: `${CATEGORY_COLORS[category]}22`, color: CATEGORY_COLORS[category] }}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}
