import { Outlet, useLocation } from 'react-router-dom';
import { PillarTabLink } from '../components/PillarTabLink';

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
          const active = tab.to === '/elimination' ? journalActive : pathname.startsWith(tab.to);
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
