import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import AnalyticsPage from './pages/AnalyticsPage';
import PetsPage from './pages/PetsPage';
import DashboardPage from './pages/DashboardPage';
import DayPage from './pages/DayPage';
import ImportsPage from './pages/ImportsPage';
import SchedulesPage from './pages/SchedulesPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/days/:date" element={<DayPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/pets" element={<PetsPage />} />
        <Route path="/schedules" element={<SchedulesPage />} />
        <Route path="/imports" element={<ImportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
