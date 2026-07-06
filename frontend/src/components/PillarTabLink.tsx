import { type ReactNode, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { handleActiveTabPress } from '../lib/activeTabPress';

// Use Link (not NavLink): NavLink with a string className still injects `active` on
// partial route matches, so `/nutrition` stays highlighted on `/nutrition/analytics`.

const mobileMq = window.matchMedia('(max-width: 768px)');

interface PillarTabLinkProps {
  to: string;
  active: boolean;
  children: ReactNode;
}

export function PillarTabLink({ to, active, children }: PillarTabLinkProps) {
  const isMobile = useSyncExternalStore(
    (onStoreChange) => {
      mobileMq.addEventListener('change', onStoreChange);
      return () => mobileMq.removeEventListener('change', onStoreChange);
    },
    () => mobileMq.matches,
    () => false,
  );

  return (
    <Link
      to={to}
      className={`pillar-tab${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={(event) => {
        if (active && isMobile) handleActiveTabPress(event);
      }}
    >
      {children}
    </Link>
  );
}
