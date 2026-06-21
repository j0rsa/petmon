import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { eliminationApi } from '../api/elimination';
import { MonthCalendar } from '../components/MonthCalendar';
import { NoPetSelected } from '../components/NoPetSelected';
import { EliminationDayPanel } from '../components/EliminationDayPanel';
import { useSelectedPet } from '../context/SelectedPetContext';
import { useDisplaySettings } from '../context/useDisplaySettings';
import { localToday, monthBounds, monthKey } from '../lib/dates';
import type { DayEliminationHighlight } from '../types/pillars';

const mq = window.matchMedia('(max-width: 768px)');

export default function EliminationJournalPage() {
  const navigate = useNavigate();
  const { date: routeDate } = useParams();
  const { selectedPetId, petsLoading } = useSelectedPet();
  const displaySettings = useDisplaySettings();
  const isMobile = useSyncExternalStore(
    (cb) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); },
    () => mq.matches,
    () => false,
  );
  const selectedDate = routeDate && /^\d{4}-\d{2}-\d{2}$/.test(routeDate) ? routeDate : localToday();
  const [month, setMonth] = useState(monthKey(selectedDate));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonth(monthKey(selectedDate));
  }, [selectedDate]);

  const { first, last } = monthBounds(month);
  const calendarQuery = useQuery({
    queryKey: ['elimination-calendar', month, selectedPetId],
    queryFn: () => eliminationApi.dailySummaries(first, last, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const highlights = useMemo((): Map<string, DayEliminationHighlight> => {
    const map = new Map<string, DayEliminationHighlight>();
    for (const summary of calendarQuery.data ?? []) {
      map.set(summary.local_date, {
        totalCount: summary.total_count - summary.vomit_count,
        hasVomit: summary.has_vomit,
        hasDefecation: summary.defecation_count > 0,
        avgDurationSec: summary.avg_duration_seconds ?? null,
      });
    }
    return map;
  }, [calendarQuery.data]);

  function selectDate(date: string) {
    navigate(date === localToday() ? '/elimination' : `/elimination/${date}`);
  }

  function renderDayHints(date: string) {
    const h = highlights.get(date);
    if (!h || (h.totalCount === 0 && !h.hasVomit && !h.hasDefecation)) return { hasData: false, lines: [] };
    const visitLabel = isMobile ? `${h.totalCount}×` : `${h.totalCount} visit${h.totalCount === 1 ? '' : 's'}`;
    const lines = [visitLabel];
    if (h.avgDurationSec != null) {
      const mins = Math.floor(h.avgDurationSec / 60);
      const secs = Math.round(h.avgDurationSec % 60);
      lines.push(mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`);
    }
    const dots = (
      <>
        {h.hasDefecation && <span key="poop-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--metric-water)', marginTop: 2 }} title="poop" />}
        {h.hasVomit && <span key="vomit-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--error-text)', marginTop: 2 }} title="vomit" />}
      </>
    );
    return {
      hasData: true,
      lines,
      extra: dots,
    };
  }

  if (petsLoading) {
    return <div className="loading-state">Loading…</div>;
  }

  if (!selectedPetId) {
    return <NoPetSelected />;
  }

  return (
    <div className="nutrition-journal">
      <MonthCalendar
        month={month}
        selectedDate={selectedDate}
        highlights={new Map()}
        renderDayHints={renderDayHints}
        onMonthChange={setMonth}
        onSelectDate={selectDate}
        onGoToToday={() => selectDate(localToday())}
        compact={isMobile}
        calendarConfig={displaySettings}
        weekStart={displaySettings.calendar_week_start}
        footnote="Visits exclude vomit. Blue dot = poop, red dot = vomit. Select a day to open its log."
      />
      <EliminationDayPanel date={selectedDate} petId={selectedPetId} />
    </div>
  );
}
