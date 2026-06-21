import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import { NutritionLayout } from './layouts/NutritionLayout';
import { EliminationLayout } from './layouts/EliminationLayout';
import AnalyticsPage from './pages/AnalyticsPage';
import PetsPage from './pages/PetsPage';
import PetInfoPage from './pages/PetInfoPage';
import OverviewPage from './pages/OverviewPage';
import NutritionJournalPage from './pages/NutritionJournalPage';
import EliminationJournalPage from './pages/EliminationJournalPage';
import EliminationAnalyticsPage from './pages/EliminationAnalyticsPage';
import ImportsPage from './pages/ImportsPage';
import SchedulesPage from './pages/SchedulesPage';
import HealthPage from './pages/HealthPage';
import SettingsPage from './pages/SettingsPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

export default function App() {
  return (
    <Routes>
      {/* Public — no layout, no auth */}
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/nutrition" element={<NutritionLayout />}>
            <Route index element={<NutritionJournalPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="schedules" element={<SchedulesPage />} />
            <Route path="import" element={<ImportsPage />} />
            <Route path=":date" element={<NutritionJournalPage />} />
          </Route>
          <Route path="/elimination" element={<EliminationLayout />}>
            <Route index element={<EliminationJournalPage />} />
            <Route path="analytics" element={<EliminationAnalyticsPage />} />
            <Route path=":date" element={<EliminationJournalPage />} />
          </Route>
          <Route path="/health" element={<HealthPage />} />
          <Route path="/pets" element={<PetsPage />} />
          <Route path="/pets/:id" element={<PetInfoPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/days/:date" element={<DayRedirect />} />
          <Route path="/analytics" element={<Navigate to="/nutrition/analytics" replace />} />
          <Route path="/schedules" element={<Navigate to="/nutrition/schedules" replace />} />
          <Route path="/imports" element={<Navigate to="/nutrition/import" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}

function DayRedirect() {
  const { date } = useParams();
  return <Navigate to={date ? `/nutrition/${date}` : '/nutrition'} replace />;
}
