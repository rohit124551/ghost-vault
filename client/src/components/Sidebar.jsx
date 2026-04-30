import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LayoutDashboard, LogOut, Sun, Moon, ChevronLeft, ChevronRight } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '64px' : '200px');
  }, [collapsed]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* ── Logo ── */}
      <div className="sb-brand">
        {!collapsed && <span className="sb-logo">GhostVault</span>}
        <button className="sb-toggle" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="divider" style={{ margin: '0 0' }} />

      {/* ── Nav ── */}
      <nav className="sb-nav">
        <NavLink
          to="/dash"
          className={({ isActive }) => `sb-link${isActive ? ' sb-link--active' : ''}`}
          title={collapsed ? 'Dashboard' : ''}
        >
          <LayoutDashboard size={14} />
          {!collapsed && <span>Dashboard</span>}
        </NavLink>
      </nav>

      {/* ── Footer ── */}
      <div className="sb-footer">
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleSignOut}
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>

        <div className="sb-user">
          <div className="sb-avatar">{user?.email?.[0]?.toUpperCase()}</div>
          {!collapsed && <span className="sb-email truncate">{user?.email}</span>}
        </div>
      </div>
    </aside>
  );
}
