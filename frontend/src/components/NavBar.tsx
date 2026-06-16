import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { meApi } from '../api/me';
import { clearToken } from '../lib/auth';
import { PILLARS } from '../types/pillars';

const utilityLinks = [
  { to: '/pets', label: 'Pets' },
  { to: '/settings', label: 'Settings' },
];

export function NavBar() {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: meApi.get,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

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
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}${pillar.available ? '' : ' nav-link-muted'}`}
          >
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

      {me && (
        <div className="sidebar-user">
          <span className="sidebar-user-kind">{me.kind === 'api_token' ? 'api token' : me.kind}</span>
          <span className="sidebar-user-name">{me.display_name}</span>
          {me.kind !== 'dev' && (
            <button
              className="sidebar-user-logout"
              type="button"
              onClick={() => { clearToken(); window.location.href = '/'; }}
            >
              sign out
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
