import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const HEALTH_URL = `${API_URL}/api/health`;
const SESSION_KEY = 'sv_server_awake';

/**
 * useServerHealth — pings /api/health on mount.
 * - If cached awake in sessionStorage → skip check (instant)
 * - If no response in 4s → show wake-up screen, poll every 3s
 * - Once alive → cache in sessionStorage → { awake: true }
 */
export function useServerHealth() {
  const [awake, setAwake] = useState(() => !!sessionStorage.getItem(SESSION_KEY));
  const [checking, setChecking] = useState(() => !sessionStorage.getItem(SESSION_KEY));

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return; // already confirmed awake this session

    let cancelled = false;
    let pollTimer = null;

    async function ping() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok && !cancelled) {
          sessionStorage.setItem(SESSION_KEY, '1');
          setAwake(true);
          setChecking(false);
        }
      } catch {
        // Server asleep or timeout — keep polling
        if (!cancelled) {
          setChecking(false); // show wake-up screen
          pollTimer = setTimeout(ping, 3000);
        }
      }
    }

    ping();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, []);

  return { awake, checking };
}
