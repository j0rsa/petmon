import type { ReactNode } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { handleActiveTabPress } from '../lib/activeTabPress';

interface BottomNavLinkProps {
  to: string;
  end?: boolean;
  children: ReactNode;
}

export function BottomNavLink({ to, end, children }: BottomNavLinkProps) {
  const matchPattern = end ? { path: to, end: true as const } : { path: to, end: false as const };
  const isActive = Boolean(useMatch(matchPattern));

  return (
    <NavLink
      to={to}
      end={end}
      className={`bottom-nav-item${isActive ? ' active' : ''}`}
      onClick={(event) => {
        if (isActive) handleActiveTabPress(event);
      }}
    >
      {children}
    </NavLink>
  );
}
