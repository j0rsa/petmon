import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { nutritionAnalyticsApi } from '../api/analytics';
import { daysApi } from '../api/days';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, shiftDate, formatDisplayDate } from '../lib/dates';
import { highlightFromSummary, totalKnownFluidMl } from '../lib/nutritionMetrics';
import { WET_FOOD_FLUID_RATIO } from '../lib/cumulativeFluid';

const STREAK_DAYS = 30;
const WEEK_DAYS = 7;

export default function OverviewPage() {
  const today = localToday();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();

  const streakFrom = shiftDate(today, -(STREAK_DAYS - 1));
  const weekFrom = shiftDate(today, -(WEEK_DAYS - 1));

  const todayQuery = useQuery({
    queryKey: ['day-summary', today, selectedPetId],
    queryFn: () => daysApi.getSummary(today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const streakQuery = useQuery({
    queryKey: ['overview-streak', streakFrom, today, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.dailyTotals(streakFrom, today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const weekQuery = useQuery({
    queryKey: ['overview-week', weekFrom, today, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.dailyTotals(weekFrom, today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const highlight = todayQuery.data ? highlightFromSummary(todayQuery.data) : null;
  const totalFluid = highlight ? totalKnownFluidMl(highlight) : 0;

  // Build per-day fluid totals for the 7-day sparkline
  const weekFluidByDate = new Map<string, number>();
  for (const row of weekQuery.data ?? []) {
    const fluid = row.category === 'liquids' || row.category === 'water'
      ? row.total_amount
      : row.category === 'wet_food'
        ? row.total_amount * WET_FOOD_FLUID_RATIO
        : 0;
    if (fluid > 0) weekFluidByDate.set(row.local_date, (weekFluidByDate.get(row.local_date) ?? 0) + fluid);
  }
  const weekBars = Array.from({ length: WEEK_DAYS }, (_, i) => {
    const date = shiftDate(today, -(WEEK_DAYS - 1 - i));
    return { date, fluid: weekFluidByDate.get(date) ?? 0 };
  });
  const maxFluid = Math.max(...weekBars.map(b => b.fluid), 1);
  const activeDays = weekBars.filter(b => b.fluid > 0).length;

  // Streak: count consecutive days back from today with at least one record
  const recordedDates = new Set(
    (streakQuery.data ?? []).map(r => r.local_date)
  );
  let streak = 0;
  for (let i = 0; i < STREAK_DAYS; i++) {
    const date = shiftDate(today, -i);
    if (recordedDates.has(date)) streak++;
    else break;
  }

  const isLoading = todayQuery.isLoading || weekQuery.isLoading || streakQuery.isLoading;

  if (petsLoading) return <div className="loading-state">Loading…</div>;
  if (!selectedPetId) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Monitoring highlights</h2>
          </div>
        </section>
        <NoPetSelected />
      </div>
    );
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <section className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>{selectedPet?.name ?? 'Pet'}</h2>
          <p className="muted-text">{formatDisplayDate(today)}</p>
        </div>
        <Link className="button button-secondary button-compact" to="/nutrition">
          Open journal →
        </Link>
      </section>

      {isLoading ? (
        <div className="loading-state">Loading…</div>
      ) : (
        <>
          {/* Today's fluid summary */}
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Today</p>
                <h3>Fluid intake</h3>
              </div>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '2rem',
                color: totalFluid > 0 ? 'var(--accent)' : 'var(--text-subtle)',
              }}>
                ~{totalFluid}<span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>ml</span>
              </span>
            </div>

            {highlight && (highlight.liquids > 0 || highlight.water > 0 || highlight.wetFood > 0) ? (
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {highlight.liquids > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--metric-water)' }}>
                    {Math.round(highlight.liquids)} ml liquids
                  </span>
                )}
                {highlight.water > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--metric-water)' }}>
                    {Math.round(highlight.water)} ml water
                  </span>
                )}
                {highlight.wetFood > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--metric-wet)' }}>
                    {Math.round(highlight.wetFood)} g wet food
                    <span style={{ color: 'var(--text-subtle)', marginLeft: '0.3rem' }}>
                      (~{Math.round(highlight.wetFood * WET_FOOD_FLUID_RATIO)} ml)
                    </span>
                  </span>
                )}
                {highlight.recordCount > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                    {highlight.recordCount} record{highlight.recordCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            ) : (
              <p className="muted-text" style={{ fontSize: '0.88rem' }}>No records logged today yet.</p>
            )}
          </section>

          {/* 7-day sparkline + streak */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'stretch' }}>
            {/* Sparkline */}
            <section className="panel" style={{ gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <p className="eyebrow">Last 7 days</p>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {activeDays}/7 days logged
                </span>
              </div>
              {(() => {
                const BAR_HEIGHT = 100;
                const LABEL_HEIGHT = 20;
                return (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end', height: BAR_HEIGHT + LABEL_HEIGHT }}>
                    {weekBars.map(({ date, fluid }) => {
                      const isToday = date === today;
                      const barPx = fluid > 0 ? Math.max(Math.round((fluid / maxFluid) * BAR_HEIGHT), 6) : 2;
                      return (
                        <Link
                          key={date}
                          to={`/nutrition/${date}`}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                          title={`${date}: ${Math.round(fluid)} ml`}
                        >
                          <div style={{
                            width: '100%',
                            height: barPx,
                            background: isToday ? 'var(--accent)' : fluid > 0 ? 'var(--metric-water)' : 'var(--border)',
                            borderRadius: 4,
                            opacity: isToday ? 1 : 0.7,
                          }} />
                          <span style={{
                            fontSize: '0.62rem',
                            color: isToday ? 'var(--accent)' : 'var(--text-subtle)',
                            fontFamily: 'monospace',
                            height: LABEL_HEIGHT,
                            lineHeight: `${LABEL_HEIGHT}px`,
                          }}>
                            {new Date(`${date}T00:00:00`).getDate()}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                );
              })()}
            </section>

            {/* Streak */}
            <section className="panel" style={{ minWidth: 120, alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <p className="eyebrow">Streak</p>
              <span style={{
                fontFamily: 'monospace',
                fontSize: '2.6rem',
                color: streak > 0 ? 'var(--accent)' : 'var(--text-subtle)',
                lineHeight: 1,
              }}>
                {streak}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                day{streak === 1 ? '' : 's'} in a row
              </span>
              {streak === 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textAlign: 'center' }}>
                  log today to start one
                </span>
              )}
            </section>
          </div>

          {/* Quick links */}
          <section className="panel" style={{ gap: '0.5rem' }}>
            <p className="eyebrow">Nutrition</p>
            <div className="pillar-links" style={{ gap: '0.5rem' }}>
              <Link className="button button-secondary button-compact" to="/nutrition">Journal</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/analytics">Analytics</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/schedules">Schedules</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/import">Import</Link>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>
              Toileting and health pillars coming soon.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
