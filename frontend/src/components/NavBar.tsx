import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { meApi } from '../api/me';
import { performSignOut } from '../lib/signOut';
import { PawPrint, Utensils, HeartPulse } from 'lucide-react';
import { PILLARS, type MonitoringPillar } from '../types/pillars';
import { AppVersionFooter } from './AppVersionFooter';
import { ExternalLinks } from './ExternalLinks';

const PILLAR_ICONS: Record<MonitoringPillar, React.ReactNode> = {
  nutrition: <Utensils size={18} />,
  elimination: <PawPrint size={18} />,
  health: <HeartPulse size={18} />,
};

const utilityLinks = [
  { to: '/pets', label: 'Pets' },
  { to: '/settings', label: 'Settings' },
];

export function NavBar() {
  return (
    <nav className="sidebar-nav">
      <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
        Overview
      </NavLink>

      <div className="nav-section">
        <span className="nav-section-label">Pillars</span>
        {PILLARS.map((pillar) => (
          <NavLink
            key={pillar.id}
            to={pillar.route}
            className={({ isActive }) => `nav-link nav-link-icon${isActive ? ' active' : ''}${pillar.available ? '' : ' nav-link-muted'}`}
          >
            <span className="nav-link-pillar-icon">{PILLAR_ICONS[pillar.id]}</span>
            {pillar.label}
            {!pillar.available && <span className="nav-soon">soon</span>}
          </NavLink>
        ))}
      </div>

      <div className="nav-section">
        <span className="nav-section-label">Manage</span>
        {utilityLinks.map((link) => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            {link.label}
          </NavLink>
        ))}
      </div>

      <ExternalLinks />
    </nav>
  );
}

export function SidebarUserChip() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: meApi.get,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!me) return null;

  function handleSignOut() {
    void performSignOut(me.kind as 'oidc' | 'api_token' | 'dev');
  }

  return (
    <div className="sidebar-user">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: me.kind === 'dev' ? 'var(--text-subtle)' : me.kind === 'oidc' ? 'var(--pill-active-text)' : 'var(--accent)',
        }} />
        <div style={{ minWidth: 0 }}>
          <span className="sidebar-user-name">{me.display_name}</span>
          {me.kind === 'api_token' && me.token_created_by && (
            <span className="sidebar-user-token-creator">{me.token_created_by}</span>
          )}
        </div>
      </div>
      {me.kind !== 'dev' && (
        <button
          className="sidebar-user-logout"
          type="button"
          onClick={handleSignOut}
        >
          sign out
        </button>
      )}
      <AppVersionFooter />
    </div>
  );
}
