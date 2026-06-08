import { DayView } from './DayPage';

function todayDate() {
  const now = new Date();
  const adjusted = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  return <DayView date={todayDate()} title="Dashboard" />;
}
