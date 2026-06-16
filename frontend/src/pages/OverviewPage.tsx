import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { nutritionAnalyticsApi } from '../api/analytics';
import { daysApi } from '../api/days';
import { NoPetSelected } from '../components/NoPetSelected';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday } from '../lib/dates';
import { formatDayHint, highlightFromSummary } from '../lib/nutritionMetrics';
import { PILLARS, upcomingPillarLabels } from '../types/pillars';

export default function OverviewPage() {
  const today = localToday();
  const { selectedPetId, selectedPet, pets, petsLoading } = useSelectedPet();

  const todaySummaryQuery = useQuery({
    queryKey: ['day-summary', today, selectedPetId],
    queryFn: () => daysApi.getSummary(today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });
  const weekQuery = useQuery({
    queryKey: ['overview-week', today, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.dailyTotals(shiftWeekStart(today), today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const nutritionHighlight = todaySummaryQuery.data ? highlightFromSummary(todaySummaryQuery.data) : null;
  const activeDaysThisWeek = weekQuery.data?.filter((row) => row.record_count > 0).length ?? 0;

  if (petsLoading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (!selectedPetId) {
    return (
      <div className="page-stack overview-page">
        <section className="page-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h2>Monitoring highlights</h2>
            <p className="muted-text">
              A cross-pillar snapshot. Nutrition is live; {upcomingPillarLabels()} will plug in here.
            </p>
          </div>
        </section>
        <NoPetSelected />
      </div>
    );
  }

  return (
    <div className="page-stack overview-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>{selectedPet?.name ?? 'Pet'} highlights</h2>
          <p className="muted-text">
            A cross-pillar snapshot. Nutrition is live; {upcomingPillarLabels()} will plug in here.
          </p>
        </div>
      </section>

      <section className="pillar-highlight-grid">
        {PILLARS.map((pillar) => {
          if (pillar.id === 'nutrition') {
            return (
              <article key={pillar.id} className="pillar-highlight-card pillar-highlight-live">
                <div className="pillar-highlight-head">
                  <div>
                    <p className="eyebrow">{pillar.label}</p>
                    <h3>Today</h3>
                  </div>
                  <Link className="text-link" to="/nutrition">
                    Open journal →
                  </Link>
                </div>
                {todaySummaryQuery.isLoading ? (
                  <p className="muted-text">Loading nutrition summary…</p>
                ) : (
                  <div className="pillar-metrics">
                    <div>
                      <span className="metric-label">Records</span>
                      <strong>{nutritionHighlight?.recordCount ?? 0}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Highlight</span>
                      <strong className="metric-inline">{formatDayHint(nutritionHighlight ?? undefined) || 'No logs yet'}</strong>
                    </div>
                    <div>
                      <span className="metric-label">Active days (7d)</span>
                      <strong>{activeDaysThisWeek}</strong>
                    </div>
                  </div>
                )}
                <div className="pillar-links">
                  <Link to="/nutrition/analytics">Analytics</Link>
                  <Link to="/nutrition/schedules">Feeding</Link>
                  <Link to="/nutrition/import">Import</Link>
                </div>
              </article>
            );
          }

          return (
            <article key={pillar.id} className="pillar-highlight-card pillar-highlight-soon">
              <div className="pillar-highlight-head">
                <div>
                  <p className="eyebrow">{pillar.label}</p>
                  <h3>Coming soon</h3>
                </div>
                <span className="status-pill">Planned</span>
              </div>
              <p className="muted-text">{pillar.description}</p>
              <Link className="text-link muted-text" to={pillar.route}>
                View placeholder →
              </Link>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pets</p>
            <h3>{pets.length} profile{pets.length === 1 ? '' : 's'}</h3>
          </div>
          <Link className="button button-secondary button-compact" to="/pets">
            Manage pets
          </Link>
        </div>
        <div className="pet-chip-row">
          {pets.map((pet) => (
            <Link key={pet.id} className={`pet-chip${pet.id === selectedPetId ? ' selected' : ''}`} to={`/pets/${pet.id}`}>
              {pet.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function shiftWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - 6);
  return value.toISOString().slice(0, 10);
}
