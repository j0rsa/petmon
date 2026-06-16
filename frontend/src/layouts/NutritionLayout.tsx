import { NavLink, Outlet, useLocation } from 'react-router-dom';

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
          if (tab.to === '/nutrition') {
            return (
              <NavLink key={tab.to} to={tab.to} className={() => `pillar-tab${journalActive ? ' active' : ''}`}>
                {tab.label}
              </NavLink>
            );
          }
          return (
            <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `pillar-tab${isActive ? ' active' : ''}`}>
              {tab.label}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
