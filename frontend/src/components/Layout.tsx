import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">catmon</p>
          <h1 className="app-title">Cat intake tracking</h1>
          <p className="muted-text">Monitor meals, water, medication, imports, and daily trends.</p>
        </div>
        <NavBar />
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
