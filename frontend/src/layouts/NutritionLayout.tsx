import { Outlet, useLocation } from 'react-router-dom';
import { PillarTabLink } from '../components/PillarTabLink';

const DATE_SEGMENT = /^\/nutrition\/\d{4}-\d{2}-\d{2}$/;

const tabs = [
  { to: '/nutrition', label: 'Journal' },
  { to: '/nutrition/analytics', label: 'Analytics' },
  { to: '/nutrition/schedules', label: 'Feeding' },
  { to: '/nutrition/import', label: 'Import' },
];

export function NutritionLayout() {
  const { pathname } = useLocation();
  const journalActive = pathname === '/nutrition' || DATE_SEGMENT.test(pathname);

  return (
    <div className="page-stack pillar-page">
      <div className="pillar-tab-bar">
        {tabs.map((tab) => {
          const active = tab.to === '/nutrition' ? journalActive : pathname.startsWith(tab.to);
          return (
            <PillarTabLink key={tab.to} to={tab.to} active={active}>
              {tab.label}
            </PillarTabLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
