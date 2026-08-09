import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { daysApi } from '../api/days';
import { eliminationApi, isAlarmingEliminationType } from '../api/elimination';
import { weightApi } from '../api/weight';
import { healthStateApi } from '../api/healthState';
import { healthStateEmoji, healthStateLabel } from '../lib/healthState';
import { NoPetSelected } from '../components/NoPetSelected';
import { OverviewQuickLog } from '../components/OverviewQuickLog';
import { useSelectedPet } from '../context/SelectedPetContext';
import { usePermissions } from '../context/usePermissions';
import { localToday, shiftDate } from '../lib/dates';
import { useFormatDate } from '../context/useDisplaySettings';
import { highlightFromSummary, totalKnownFluidMl } from '../lib/nutritionMetrics';
import { WET_FOOD_FLUID_RATIO } from '../lib/cumulativeFluid';

export default function OverviewPage() {
  const today = localToday();
  const formatDate = useFormatDate();
  const { selectedPetId, selectedPet, petsLoading } = useSelectedPet();
  const { canWrite } = usePermissions();

  const todayQuery = useQuery({
    queryKey: ['day-summary', today, selectedPetId],
    queryFn: () => daysApi.getSummary(today, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const highlight = todayQuery.data ? highlightFromSummary(todayQuery.data) : null;
  const totalFluid = highlight ? totalKnownFluidMl(highlight) : 0;

  const toiletingQuery = useQuery({
    queryKey: ['elimination-records-day', today, selectedPetId],
    queryFn: () => eliminationApi.list({ date: today, pet_id: selectedPetId! }),
    enabled: Boolean(selectedPetId),
  });

  const weightStatsFrom = shiftDate(today, -29);
  const weightStatsQuery = useQuery({
    queryKey: ['weight-stats', selectedPetId, weightStatsFrom, today],
    queryFn: () => weightApi.stats(selectedPetId!, weightStatsFrom, today),
    enabled: Boolean(selectedPetId),
  });

  const healthStateQuery = useQuery({
    queryKey: ['health-state-records', selectedPetId],
    queryFn: () => healthStateApi.list({ pet_id: selectedPetId! }),
    enabled: Boolean(selectedPetId),
  });

  const isLoading = todayQuery.isLoading;

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
          <p className="muted-text">{formatDate(today)}</p>
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

          {canWrite && <OverviewQuickLog date={today} petId={selectedPetId} />}

          {/* Nutrition links */}
          <section className="panel" style={{ gap: '0.5rem' }}>
            <p className="eyebrow">Nutrition</p>
            <div className="pillar-links" style={{ gap: '0.5rem' }}>
              <Link className="button button-secondary button-compact" to="/nutrition">Journal</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/analytics">Analytics</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/schedules">Schedules</Link>
              <Link className="button button-secondary button-compact" to="/nutrition/import">Import</Link>
            </div>
          </section>

          {/* Toileting overview */}
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Toileting</p>
                <h3>Today</h3>
              </div>
              <Link className="button button-secondary button-compact" to="/elimination">
                Open →
              </Link>
            </div>

            {toiletingQuery.isLoading ? (
              <p className="muted-text" style={{ fontSize: '0.88rem' }}>Loading…</p>
            ) : (() => {
              const records = toiletingQuery.data ?? [];
              const wees = records.filter(r => r.event_type === 'urination').length;
              const poops = records.filter(r => r.event_type === 'defecation').length;
              const vomits = records.filter(r => r.event_type === 'vomit').length;
              const nothings = records.filter(r => r.event_type === 'no_output').length;
              const total = records.filter(r => !isAlarmingEliminationType(r.event_type)).length;

              if (total === 0 && vomits === 0 && nothings === 0) {
                return <p className="muted-text" style={{ fontSize: '0.88rem' }}>No visits logged today yet.</p>;
              }

              return (
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '1.65rem', color: 'var(--accent)' }}>
                    {total}
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '0.3rem', fontFamily: 'inherit' }}>
                      visit{total === 1 ? '' : 's'}
                    </span>
                  </span>
                  {wees > 0 && (
                    <span style={{ fontSize: '0.88rem', color: 'var(--metric-water)' }}>{wees} wee{wees === 1 ? '' : 's'}</span>
                  )}
                  {poops > 0 && (
                    <span style={{ fontSize: '0.88rem', color: 'var(--metric-wet)' }}>{poops} poop{poops === 1 ? '' : 's'}</span>
                  )}
                  {vomits > 0 && (
                    <span style={{ fontSize: '0.88rem', color: 'var(--error-text)', fontWeight: 600 }}>⚠ {vomits} vomit{vomits === 1 ? '' : 's'}</span>
                  )}
                  {nothings > 0 && (
                    <span style={{ fontSize: '0.88rem', color: 'var(--error-text)', fontWeight: 600 }}>⚠ {nothings} nothing visit{nothings === 1 ? '' : 's'}</span>
                  )}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <Link className="button button-secondary button-compact" to="/elimination">Journal</Link>
              <Link className="button button-secondary button-compact" to="/elimination/analytics">Analytics</Link>
            </div>
          </section>

          {/* Health overview */}
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Health</p>
                <h3>Latest</h3>
              </div>
            </div>

            {weightStatsQuery.isLoading || healthStateQuery.isLoading ? (
              <p className="muted-text" style={{ fontSize: '0.88rem' }}>Loading…</p>
            ) : (() => {
              const latestState = healthStateQuery.data?.[0];
              const weightStats = weightStatsQuery.data;
              const hasState = Boolean(latestState);
              const hasWeight = Boolean(weightStats?.latest_kg != null);

              if (!hasState && !hasWeight) {
                return <p className="muted-text" style={{ fontSize: '0.88rem' }}>No health records yet.</p>;
              }

              const delta = weightStats?.avg_kg != null && weightStats.latest_kg != null
                ? weightStats.latest_kg - weightStats.avg_kg
                : null;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {hasState && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', minWidth: '6.5rem' }}>Overall state</span>
                      <span style={{ fontSize: '1.4rem' }} aria-hidden="true">{healthStateEmoji(latestState!.level)}</span>
                      <span style={{ fontSize: '0.88rem' }}>{healthStateLabel(latestState!.level)}</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                        {formatDate(latestState!.local_date, 'short')}
                      </span>
                    </div>
                  )}
                  {hasWeight && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', minWidth: '6.5rem' }}>Weight</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '1.65rem', color: 'var(--accent)' }}>
                        {weightStats!.latest_kg!.toFixed(2)}
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>kg</span>
                      </span>
                      {delta !== null && weightStats!.count >= 2 && (
                        <span style={{ fontSize: '0.88rem', color: delta > 0.05 ? 'var(--error-text)' : delta < -0.05 ? 'var(--metric-water)' : 'var(--text-muted)' }}>
                          {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta).toFixed(2)} kg vs 30d avg
                        </span>
                      )}
                      {weightStats!.latest_date && (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-subtle)', marginLeft: 'auto' }}>
                          {formatDate(weightStats!.latest_date!, 'short')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="pillar-links" style={{ gap: '0.5rem', marginTop: '0.25rem' }}>
              <Link className="button button-secondary button-compact" to="/health#wellbeing">Overall state</Link>
              <Link className="button button-secondary button-compact" to="/health#weight">Weight</Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
