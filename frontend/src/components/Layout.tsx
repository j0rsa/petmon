import { Outlet } from 'react-router-dom';
import { Calendars } from 'lucide-react';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { NavBar, SidebarUserChip } from './NavBar';
import { NotificationCenter } from './NotificationCenter';
import { SidebarPetPicker } from './SidebarPetPicker';
import { BottomNav } from './BottomNav';
import { PwaUpdateBanner } from './PwaUpdateBanner';

export function Layout() {
  return (
    <SelectedPetProvider>
      <PwaUpdateBanner />
      <NotificationCenter />
      <div className="app-shell">
        <aside className="sidebar">
          <span className="sidebar-wordmark">
            <Calendars size={16} style={{ opacity: 0.7 }} />
            petmon
          </span>
          <SidebarPetPicker />
          <NavBar />
          <SidebarUserChip />
        </aside>
        <main className="content">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </SelectedPetProvider>
  );
}
