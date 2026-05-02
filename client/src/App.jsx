import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useServerHealth } from './hooks/useServerHealth';
import ServerWakeUp from './components/ServerWakeUp';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import DashboardPage from './pages/DashboardPage';
import GuestRoomPage from './pages/GuestRoomPage';
import NotFoundPage from './pages/NotFoundPage';
import LandingPage from './pages/LandingPage';
import InstallPrompt from './components/InstallPrompt';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}><div className="spinner spinner-lg" /></div>;
  return user ? children : <Navigate to="/login" replace />;
}

function OwnerLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">{children}</main>
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

// Real-time Offline Overlay
function OfflineOverlay() {
  return (
    <div className="offline-overlay">
      <div className="offline-card">
        <div className="offline-ghost">👻</div>
        <h2>Connection Lost</h2>
        <p>GhostVault needs an active connection to stay secure. Reconnecting...</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading } = useAuth();
  const { awake, checking } = useServerHealth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // When server wakes, dispatch event for ServerWakeUp component countdown
  useEffect(() => {
    if (awake) window.dispatchEvent(new Event('sv:server-ready'));
  }, [awake]);

  // Show wake-up screen while server is starting
  // Skip wake-up screen if running in standalone mode (PWA) and user is already logged in
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  if ((checking || !awake) && !(isStandalone && user)) return <ServerWakeUp />;

  if (authLoading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}><div className="spinner spinner-lg" /></div>;

  return (
    <>
      <PanicMode />
      {!isOnline && <OfflineOverlay />}
      <InstallPrompt />
      <Routes>
        <Route path="/login"         element={user ? <Navigate to="/dash" /> : <LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/r/:token"      element={<GuestRoomPage />} />
        <Route path="/404"           element={<NotFoundPage />} />

        <Route path="/dash" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />

        <Route path="/"  element={<LandingPage />} />
        <Route path="*"  element={<Navigate to="/404" />} />
      </Routes>
    </>
  );
}
