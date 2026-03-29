import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Activity, AlertTriangle, LayoutDashboard, LogOut, Zap, Shield } from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
      isActive
        ? 'bg-grid-accent/15 text-grid-accent-glow border border-grid-accent/30'
        : 'text-grid-text-muted hover:text-grid-text hover:bg-grid-surface-2'
    }`;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-grid-surface border-r border-grid-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-grid-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-grid-accent to-blue-400 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">GridWatch</h1>
              <p className="text-[11px] text-grid-text-muted -mt-0.5">Anomaly Detection</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1.5">
          <NavLink to="/" end className={navLinkClass}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </NavLink>
          <NavLink to="/alerts" className={navLinkClass}>
            <AlertTriangle className="w-4 h-4" />
            Alerts
          </NavLink>
        </nav>

        {/* User info */}
        <div className="px-3 py-4 border-t border-grid-border">
          <div className="glass-card px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-grid-accent to-purple-500 flex items-center justify-center">
                {user?.role === 'supervisor' ? (
                  <Shield className="w-4 h-4 text-white" />
                ) : (
                  <Activity className="w-4 h-4 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user?.username}</p>
                <p className="text-[11px] text-grid-text-muted capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 text-grid-text-muted hover:text-status-critical rounded-md hover:bg-red-500/10 transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            {user?.zones && (
              <div className="mt-2 flex flex-wrap gap-1">
                {user.zones.map((z) => (
                  <span key={z.zone_id} className="text-[10px] px-1.5 py-0.5 rounded bg-grid-accent/10 text-grid-accent-glow border border-grid-accent/20">
                    {z.zone_name.split(' ')[0]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
