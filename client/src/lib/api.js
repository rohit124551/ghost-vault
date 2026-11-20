import axios from 'axios';
import supabase from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({ baseURL: API_URL });

// Attach Supabase JWT to every request automatically
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (config.authRetried && config.sessionUserId !== session?.user.id) throw new axios.CanceledError('Session changed');
  if (session?.access_token) {
    config.sessionUserId = session.user.id;
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Concurrent dashboard reads can encounter the same stale token.
let refreshInFlight;
api.interceptors.response.use(undefined, async error => {
  const request = error.config;
  if (error.response?.status !== 401 || request?.method !== 'get' ||
      !request.sessionUserId || request.authRetried || request.signal?.aborted) throw error;

  const {data:{session}} = await supabase.auth.getSession();
  if (session?.user.id !== request.sessionUserId) throw error;
  if (request.headers.Authorization === 'Bearer ' + session.access_token) {
    refreshInFlight ??= supabase.auth.refreshSession().finally(() => { refreshInFlight = undefined; });
    const refreshed = await refreshInFlight;
    if (refreshed.error || refreshed.data.session?.user.id !== request.sessionUserId) throw error;
  }
  request.authRetried = true;
  return api.request(request);
});

export default api;
