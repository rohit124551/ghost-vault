import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, LogOut } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className="sidebar">
      {/* ── Logo ── */}
      <div className="sb-brand">
        <span className="sb-logo">GhostVault</span>
      </div>

      <div className="divider" style={{ margin: '0 0' }} />

      {/* ── Nav ── */}
      <nav className="sb-nav">
        <NavLink
          to="/dash"
          className={({ isActive }) => `sb-link${isActive ? ' sb-link--active' : ''}`}
        >
          <LayoutDashboard size={14} />
          <span>Dashboard</span>
        </NavLink>
      </nav>

      {/* ── Footer ── */}
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{user?.email?.[0]?.toUpperCase()}</div>
          <span className="sb-email truncate">{user?.email}</span>
        </div>
        <button
          className="btn btn-ghost btn-icon btn-sm"
          onClick={handleSignOut}
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
}
