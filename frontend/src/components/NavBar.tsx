import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { meApi } from '../api/me';
import { infoApi } from '../api/info';
import { clearToken } from '../lib/auth';
import { PawPrint, Utensils, HeartPulse } from 'lucide-react';
import { PILLARS, type MonitoringPillar } from '../types/pillars';

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
        <a href="/api-docs" target="_blank" rel="noopener noreferrer" className="nav-link nav-link-icon" style={{ color: 'var(--nav-text)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          API docs
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.5 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>

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

  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: infoApi.get,
    staleTime: Infinity,
    retry: false,
  });

  if (!me) return null;

  return (
    <div className="sidebar-user">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: me.kind === 'dev' ? 'var(--text-subtle)' : me.kind === 'oidc' ? 'var(--pill-active-text)' : 'var(--accent)',
        }} />
        <span className="sidebar-user-name">{me.display_name}</span>
      </div>
      {me.kind !== 'dev' && (
        <button
          className="sidebar-user-logout"
          type="button"
          onClick={() => { clearToken(); window.location.href = '/'; }}
        >
          sign out
        </button>
      )}
      {info && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', letterSpacing: '0.02em' }}>
          v{info.version} · {info.git_sha}
        </span>
      )}
    </div>
  );
}
