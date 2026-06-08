import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pets', label: 'Pets' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/schedules', label: 'Feeding' },
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
