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
      {/* Logo */}
      <div className="sb-brand">
        <div className="sb-monogram">SV</div>
        <span className="sb-name">SnapVault</span>
      </div>

      <div className="divider" style={{ margin: '10px 12px' }} />

      {/* Nav */}
      <nav className="sb-nav">
        <NavLink to="/dashboard" className={({ isActive }) => `sb-link ${isActive ? 'sb-link--active' : ''}`}>
          <LayoutDashboard size={14} />
          <span>Dashboard</span>
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{user?.email?.[0]?.toUpperCase()}</div>
          <div className="sb-email">{user?.email}</div>
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={handleSignOut} data-tip="Sign out">
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
}
