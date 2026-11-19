import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { LayoutDashboard, LogOut, Sun, Moon, ChevronLeft, ChevronRight, Home, Shield, X } from 'lucide-react';
import GhostLogo from './GhostLogo';
import './Sidebar.css';

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', collapsed ? '68px' : '200px');
  }, [collapsed]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
        {/* ── Brand Header (Desktop) ── */}
        <div className="sb-brand">
          <div className="flex items-center gap-2 overflow-hidden">
            <GhostLogo className="w-5 h-5 text-accent shrink-0" />
            {!collapsed && <span className="sb-logo">GhostVault</span>}
          </div>
          <button 
            className="sb-toggle" 
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>

        <div className="divider sb-desktop-divider" />

        {/* ── Nav Links ── */}
        <nav className="sb-nav">
          <NavLink
            to="/"
            state={{ fromSidebar: true }}
            className={({ isActive }) => `sb-link${isActive ? ' sb-link--active' : ''}`}
            title="Home"
            end
          >
            <Home size={16} />
            <span className="sb-link-label">Home</span>
          </NavLink>

          <NavLink
            to="/dash"
            className={({ isActive }) => `sb-link${isActive ? ' sb-link--active' : ''}`}
            title="Console"
          >
            <LayoutDashboard size={16} />
            <span className="sb-link-label">Console</span>
          </NavLink>

          {/* Mobile-Only Actions */}
          <button
            className="sb-link sb-mobile-action"
            onClick={toggleTheme}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} />}
            <span className="sb-link-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          <button
            className="sb-link sb-mobile-action text-danger"
            onClick={() => setShowLogoutConfirm(true)}
            title="Sign Out"
          >
            <LogOut size={16} />
            <span className="sb-link-label">Exit</span>
          </button>
        </nav>

        {/* ── Desktop Footer ── */}
        <div className="sb-footer">
          <div className="flex items-center gap-1.5 justify-between w-full">
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={14} className="text-amber-400" /> : <Moon size={14} />}
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm hover:text-danger"
              onClick={() => setShowLogoutConfirm(true)}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>

          <div className="sb-user">
            <div className="sb-avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</div>
            {!collapsed && (
              <div className="sb-user-meta min-w-0 flex-1">
                <span className="sb-email truncate block">{user?.email}</span>
                <span className="text-[10px] font-mono text-accent flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  SecOps Live
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Logout Confirmation Modal ── */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-danger font-mono font-bold text-sm uppercase">
                <Shield size={16} /> Confirm Termination
              </div>
              <button 
                className="text-textGhost hover:text-textPrimary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-textSecondary mb-6 font-mono">
              Are you sure you want to end this SecOps session? Local handles and active tunnel tabs will be locked.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger btn-sm"
                onClick={handleSignOut}
              >
                <LogOut size={14} /> Terminate Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
