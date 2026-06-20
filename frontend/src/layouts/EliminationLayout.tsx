import { NavLink, Outlet, useLocation } from 'react-router-dom';

const DATE_SEGMENT = /^\/elimination\/\d{4}-\d{2}-\d{2}$/;

const tabs = [
  { to: '/elimination', label: 'Journal' },
  { to: '/elimination/analytics', label: 'Analytics' },
];

export function EliminationLayout() {
  const { pathname } = useLocation();
  const journalActive = pathname === '/elimination' || DATE_SEGMENT.test(pathname);

  return (
    <div className="page-stack pillar-page">
      <div className="pillar-tab-bar">
        {tabs.map((tab) => {
          if (tab.to === '/elimination') {
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
