import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/cats', label: 'Cats' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/schedules', label: 'Schedules' },
  { to: '/imports', label: 'Imports' },
];

export function NavBar() {
  return (
    <nav className="sidebar-nav">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
