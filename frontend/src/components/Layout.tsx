import { useEffect } from 'react';
import { useApplicationExtensions } from '../context/ApplicationExtensions';
import { Outlet } from 'react-router-dom';
import { Calendars } from 'lucide-react';
import { SelectedPetProvider, useSelectedPet } from '../context/SelectedPetContext';
import { DisplaySettingsProvider } from '../context/DisplaySettingsProvider';
import { NavBar, SidebarUserChip } from './NavBar';
import { NotificationCenter } from './NotificationCenter';
import { SidebarPetPicker } from './SidebarPetPicker';
import { BottomNav } from './BottomNav';
import { DemoBanner } from './DemoBanner';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useScrollToTopOnNavigate } from '../hooks/useScrollToTopOnNavigate';
import {
  consumePostAuthViewportSync,
  runViewportSyncBurst,
  syncViewportChrome,
} from '../lib/viewportChrome';

export function Layout() {
  const extensions = useApplicationExtensions();
  usePushNotifications();
  useScrollToTopOnNavigate();
  useEffect(() => {
    if (consumePostAuthViewportSync()) {
      runViewportSyncBurst();
      return;
    }
    syncViewportChrome();
  }, []);
  return (
    <DisplaySettingsProvider><SelectedPetProvider>
      <NotificationCenter />
      <DemoBanner />
      <div className="app-shell">
        <aside className="sidebar">
          <span className="sidebar-wordmark">
            <Calendars size={16} style={{ opacity: 0.7 }} />
            petmon
          </span>
          <SidebarPetPicker />
          {extensions?.chrome?.sidebar}
          <NavBar />
          <SidebarUserChip />
        </aside>
        <main className="content">
          {extensions?.chrome?.beforeContent}
          <PetContent />
        </main>
      </div>
      {/* Outside .app-shell so iOS PWA fixed positioning is not tied to the grid
          scroll container (notification deep-links scroll the page heavily). */}
      <BottomNav />
    </SelectedPetProvider></DisplaySettingsProvider>
  );
}

function PetContent() {
  const { selectedPet } = useSelectedPet();
  return <Outlet key={selectedPet?.id ?? 'no-pet'} />;
}
