import { Outlet } from 'react-router-dom';
import { SelectedPetProvider } from '../context/SelectedPetContext';
import { allPillarLabelsList } from '../types/pillars';
import { NavBar } from './NavBar';
import { SidebarPetPicker } from './SidebarPetPicker';

export function Layout() {
  return (
    <SelectedPetProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">petmon</p>
            <h1 className="app-title">Pet monitoring</h1>
            <p className="muted-text">{allPillarLabelsList()}—one overview, pillar by pillar.</p>
          </div>
          <SidebarPetPicker />
          <NavBar />
        </aside>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </SelectedPetProvider>
  );
}
