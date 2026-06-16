import { Outlet } from 'react-router-dom';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { NavBar, SidebarUserChip } from './NavBar';
import { SidebarPetPicker } from './SidebarPetPicker';

export function Layout() {
  return (
    <SelectedPetProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <span className="sidebar-wordmark">petmon</span>
          <SidebarPetPicker />
          <NavBar />
          <SidebarUserChip />
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </SelectedPetProvider>
  );
}
