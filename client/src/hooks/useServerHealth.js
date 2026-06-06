import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const HEALTH_URL = `${API_URL}/api/health`;
const SESSION_KEY = 'sv_server_awake';

/**
 * useServerHealth — pings /api/health on mount or when enabled.
 * - If cached awake in sessionStorage → skip check (instant)
 * - If no response in 4s → show wake-up screen, poll every 3s
 * - Once alive → cache in sessionStorage → { awake: true }
 */
export function useServerHealth(enabled = true) {
  const [awake, setAwake] = useState(() => !!sessionStorage.getItem(SESSION_KEY));
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (!enabled || awake) {
      if (!enabled) setShowDialog(false);
      return;
    }

    let cancelled = false;
    let pollTimer = null;

    async function ping(isFirstPing) {
      try {
        const controller = new AbortController();
        // The first ping gets 1.5s before we declare it "asleep" and show the dialog
        const timeout = setTimeout(() => controller.abort(), isFirstPing ? 1500 : 4000);
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json().catch(() => ({}));
        
        if (res.ok && data.status === 'ok' && !cancelled) {
          sessionStorage.setItem(SESSION_KEY, '1');
          setAwake(true);
          setShowDialog(false);
        } else if (!cancelled) {
          setShowDialog(true);
          pollTimer = setTimeout(() => ping(false), 3000);
        }
      } catch {
        if (!cancelled) {
          setShowDialog(true);
          pollTimer = setTimeout(() => ping(false), 3000);
        }
      }
    }

    ping(true);

    const forceCheck = async () => {
      if (!awake) return;
      
      // Silent 1.5s background check before showing dialog
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.status === 'ok') return; // It's just a network blip, server is alive!
      } catch {}
      
      if (!cancelled) {
        sessionStorage.removeItem(SESSION_KEY);
        setAwake(false);
        setShowDialog(true);
        ping(false); // start continuous polling
      }
    };

    window.addEventListener('sv:force-health-check', forceCheck);

    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
      window.removeEventListener('sv:force-health-check', forceCheck);
    };
  }, [enabled, awake]);

  return { awake, showDialog };
}
