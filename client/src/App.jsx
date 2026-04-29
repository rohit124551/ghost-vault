import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useServerHealth } from './hooks/useServerHealth';
import ServerWakeUp from './components/ServerWakeUp';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import DashboardPage from './pages/DashboardPage';
import GuestRoomPage from './pages/GuestRoomPage';
import NotFoundPage from './pages/NotFoundPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-full"><div className="spinner spinner-lg" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function OwnerLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}

// Double-Esc panic mode
function PanicMode() {
  const lastEsc = useRef(0);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      const now = Date.now();
      if (now - lastEsc.current < 500) document.body.classList.add('panic-mode');
      lastEsc.current = now;
    };
    const onDotClick = (e) => {
      if (document.querySelector('.panic-dot')?.contains(e.target))
        document.body.classList.remove('panic-mode');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onDotClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', onDotClick); };
  }, []);
  return <div className="panic-dot" title="Click to restore" />;
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { awake, checking } = useServerHealth();

  // When server wakes, dispatch event for ServerWakeUp component countdown
  useEffect(() => {
    if (awake) window.dispatchEvent(new Event('sv:server-ready'));
  }, [awake]);

  // Show wake-up screen while server is starting
  if (checking || !awake) return <ServerWakeUp />;

  if (authLoading) return <div className="loading-full"><div className="spinner spinner-lg" /></div>;

  return (
    <>
      <PanicMode />
      <Routes>
        <Route path="/login"         element={user ? <Navigate to="/dashboard" /> : <LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/r/:token"      element={<GuestRoomPage />} />
        <Route path="/404"           element={<NotFoundPage />} />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <OwnerLayout><DashboardPage /></OwnerLayout>
          </ProtectedRoute>
        } />

        <Route path="/"  element={<Navigate to={user ? '/dashboard' : '/login'} />} />
        <Route path="*"  element={<Navigate to="/404" />} />
      </Routes>
    </>
  );
}
