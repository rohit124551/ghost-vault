import { useEffect, useState } from 'react';
import './ServerWakeUp.css';

export default function ServerWakeUp() {
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = () => setReady(true);
    window.addEventListener('sv:server-ready', handler);
    return () => window.removeEventListener('sv:server-ready', handler);
  }, []);

  const progress = Math.min((elapsed / 60) * 100, 99);

  return (
    <div className="wakeup-root">
      <div className="wakeup-content">

        {/* Logo */}
        <span className="wakeup-logo">GhostVault</span>

        {/* Ghost icon — pulses while waiting, turns green when ready */}
        <div className={`wakeup-ghost ${ready ? 'wakeup-ghost--ready' : ''}`}>
          {ready ? (
            /* Checkmark */
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            /* Ghost SVG outline */
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10A8 8 0 0 0 12 2z" />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          )}
        </div>

        {/* Heading */}
        <h1 className="wakeup-heading">
          {ready ? 'Vault is ready.' : 'Starting up...'}
        </h1>

        {/* Subtext */}
        <p className="wakeup-sub">
          {ready
            ? 'Redirecting you now…'
            : 'Free servers sleep after inactivity. Ready in ~60 seconds.'}
        </p>

        {/* Progress bar */}
        <div className="wakeup-track">
          <div
            className={`wakeup-fill ${ready ? 'wakeup-fill--done' : ''}`}
            style={{ width: ready ? '100%' : `${progress}%` }}
          />
        </div>

        {/* Counter */}
        {!ready && (
          <p className="wakeup-counter">
            Waiting... <span className="wakeup-elapsed">{elapsed}s</span>
          </p>
        )}
      </div>
    </div>
  );
}
