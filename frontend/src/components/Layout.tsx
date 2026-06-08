import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">petmon</p>
          <h1 className="app-title">Pet intake tracking</h1>
          <p className="muted-text">Monitor nutrition, schedules, and daily trends for your pets.</p>
        </div>
        <NavBar />
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
