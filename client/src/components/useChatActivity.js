import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import api from '../lib/api';

export const guestApi = axios.create({baseURL: api.defaults.baseURL});

const TYPING_INTERVAL_MS = 4000;

export function useChatActivity({socket, token, myRole, messages, updateMessages, shared, loading}) {
  const [peerTyping, setPeerTyping] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const timer = useRef();
  const typingUntil = useRef(0);
  const roomSocket = useRef(null);
  const lastStart = useRef(0);
  const apiClient = myRole === 'guest' ? guestApi : api;
  useEffect(() => {
    const changed = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (!socket) return;
    const patch = event => {
      if (event.token !== token) return;
      const ids = new Set(event.ids);
      updateMessages(prev => prev.map(m => ids.has(m.id) ? {...m, ...event.patch} : m));
    };
    socket.on('chat_patch', patch);
    return () => socket.off('chat_patch', patch);
  }, [socket, token, updateMessages]);
  useEffect(() => {
    if (!socket || !shared) return;
    roomSocket.current = socket;
    const disconnected = () => setPeerTyping(false);
    const receive = event => {
      if (event.token === token) setPeerTyping(event.typing === true);
    };
    const open = joined => {
      if (joined !== token || !socket.connected) return;
      socket.emit('chat_open', token);
      // An edit can precede the asynchronous room join or a reconnect.
      if (Date.now() < typingUntil.current) {
        socket.emit('typing_start', token);
        lastStart.current = Date.now();
      }
    };
    socket.on('chat_joined', open).on('peer_typing', receive).on('disconnect', disconnected);
    open(token);
    return () => {
      if (socket.connected) socket.emit('chat_close', token);
      socket.off('chat_joined', open).off('peer_typing', receive).off('disconnect', disconnected);
      roomSocket.current = null;
      setPeerTyping(false);
    };
  }, [socket, token, shared]);

  useEffect(() => () => {
    clearTimeout(timer.current);
    typingUntil.current = 0;
    lastStart.current = 0;
  }, [shared, token]);

  useEffect(() => {
    if (!shared || loading) return;
    let cancelled = false;
    let retry;
    async function acknowledge() {
      try {
        for (const seen of [true, false]) {
          const ids = (messages || []).filter(m => m.sender === (myRole === 'owner' ? 'guest' : 'owner') &&
            (seen ? visible && !m.burn_after_seconds && !m.seen_at : !m.delivered_at && (!visible || m.burn_after_seconds))
          ).map(m => m.id);
          for (let i = 0; i < ids.length && !cancelled; i += 100) {
            const batch = ids.slice(i, i + 100);
            const {data} = await apiClient.post('/api/rooms/' + token + '/messages/receipts', {ids: batch, seen});
            if (!cancelled) updateMessages(prev => prev.map(m => batch.includes(m.id) ? {...m, ...data.patch} : m));
          }
        }
      } catch { if (!cancelled) retry = setTimeout(acknowledge, 15000); }
    }
    const delay = setTimeout(acknowledge, 120);
    return () => {cancelled = true; clearTimeout(delay); clearTimeout(retry);};
  }, [apiClient, messages, myRole, token, shared, loading, visible, updateMessages]);

  function input(active) {
    if (!shared) return;
    clearTimeout(timer.current);
    const current = roomSocket.current;
    if (!active) {
      if (typingUntil.current && current?.connected) current.emit('typing_stop', token);
      typingUntil.current = 0;
      lastStart.current = 0;
      return;
    }
    const now = Date.now();
    typingUntil.current = now + TYPING_INTERVAL_MS;
    if (current?.connected && now - lastStart.current >= TYPING_INTERVAL_MS) {
      current.emit('typing_start', token);
      lastStart.current = now;
    }
    timer.current = setTimeout(() => input(false), TYPING_INTERVAL_MS);
  }
  return {peerTyping, input, apiClient};
}
