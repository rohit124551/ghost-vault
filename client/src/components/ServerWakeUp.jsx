import { useEffect, useState } from 'react';
import './ServerWakeUp.css';

export default function ServerWakeUp() {
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);

  // Count up elapsed seconds
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Listen for parent to signal server is awake
  useEffect(() => {
    const handler = () => setReady(true);
    window.addEventListener('sv:server-ready', handler);
    return () => window.removeEventListener('sv:server-ready', handler);
  }, []);

  const progress = Math.min((elapsed / 60) * 100, 99);

  return (
    <div className="wakeup-root">
      <div className="wakeup-card">
        {/* Logo */}
        <div className="wakeup-logo">
          <div className="wakeup-monogram">GV</div>
          <span className="wakeup-brand">Ghost Vault</span>
        </div>

        {/* Icon */}
        <div className={`wakeup-icon ${ready ? 'wakeup-icon--ready' : ''}`}>
          {ready ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          )}
        </div>

        {/* Text */}
        <h1 className="wakeup-heading">
          {ready ? 'Server is ready!' : 'Starting up…'}
        </h1>
        <p className="wakeup-sub">
          {ready
            ? 'Redirecting you now…'
            : 'Free servers sleep after inactivity. Ready in ~60 seconds.'}
        </p>

        {/* Progress bar */}
        <div className="wakeup-progress-track">
          <div
            className={`wakeup-progress-fill ${ready ? 'wakeup-progress-fill--done' : ''}`}
            style={{ width: ready ? '100%' : `${progress}%` }}
          />
        </div>

        {/* Counter */}
        {!ready && (
          <div className="wakeup-counter">
            Waiting… <span className="wakeup-elapsed">{elapsed}s</span>
          </div>
        )}
      </div>
    </div>
  );
}
