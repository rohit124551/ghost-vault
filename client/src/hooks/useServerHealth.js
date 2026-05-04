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
  const [checking, setChecking] = useState(() => !sessionStorage.getItem(SESSION_KEY) && enabled);

  useEffect(() => {
    if (!enabled || awake) {
      if (!enabled) setChecking(false);
      return;
    }

    // If we're here, we need to check
    setChecking(true);
    let cancelled = false;
    let pollTimer = null;

    async function ping() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(HEALTH_URL, { signal: controller.signal });
        clearTimeout(timeout);
        
        const data = await res.json().catch(() => ({}));
        
        if (res.ok && data.status === 'ok' && !cancelled) {
          sessionStorage.setItem(SESSION_KEY, '1');
          setAwake(true);
          setChecking(false);
        } else if (!cancelled) {
          // Server not ready or invalid response — keep polling
          setChecking(false);
          pollTimer = setTimeout(ping, 3000);
        }
      } catch {
        // Network error or timeout — keep polling
        if (!cancelled) {
          setChecking(false);
          pollTimer = setTimeout(ping, 3000);
        }
      }
    }

    ping();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [enabled, awake]);

  return { awake, checking };
}
