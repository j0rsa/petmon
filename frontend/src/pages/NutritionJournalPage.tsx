import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { nutritionAnalyticsApi } from '../api/analytics';
import { MonthCalendar } from '../components/MonthCalendar';
import { NoPetSelected } from '../components/NoPetSelected';
import { NutritionDayPanel } from '../components/NutritionDayPanel';
import { useSelectedPet } from '../context/SelectedPetContext';
import { localToday, monthBounds, monthKey } from '../lib/dates';
import { aggregateDailyHighlights } from '../lib/nutritionMetrics';

const mq = window.matchMedia('(max-width: 768px)');

export default function NutritionJournalPage() {
  const navigate = useNavigate();
  const { date: routeDate } = useParams();
  const { selectedPetId, petsLoading } = useSelectedPet();
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
    queryKey: ['nutrition-calendar', month, selectedPetId],
    queryFn: () => nutritionAnalyticsApi.dailyTotals(first, last, selectedPetId!),
    enabled: Boolean(selectedPetId),
  });

  const highlights = useMemo(() => aggregateDailyHighlights(calendarQuery.data ?? []), [calendarQuery.data]);

  function selectDate(date: string) {
    navigate(date === localToday() ? '/nutrition' : `/nutrition/${date}`);
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
        highlights={highlights}
        onMonthChange={setMonth}
        onSelectDate={selectDate}
        onGoToToday={() => selectDate(localToday())}
        compact={isMobile}
      />
      <NutritionDayPanel date={selectedDate} petId={selectedPetId} />
    </div>
  );
}
