import { Outlet, useLocation } from 'react-router-dom';
import { PillarTabLink } from '../components/PillarTabLink';
import { isPillarTabActive } from '../lib/pillarTabs';

const JOURNAL_PATH = '/health';

const tabs = [
  { to: '/health', label: 'Overview' },
  { to: '/health/treatment-plan', label: 'Treatment plan' },
];

export function HealthLayout() {
  const { pathname } = useLocation();

  return (
    <div className="page-stack pillar-page">
      <div className="pillar-tab-bar">
        {tabs.map((tab) => {
          const active = isPillarTabActive(pathname, tab.to, JOURNAL_PATH);
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
